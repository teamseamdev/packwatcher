import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { calculateClipTotals } from "@/lib/clips/types";

const MomentReviewSchema = z.object({
  momentId: z.string().uuid(),
  includeInExport: z.boolean(),
  timestampStart: z.number().min(0),
  timestampEnd: z.number().min(0),
  cardName: z.string().max(120),
  setName: z.string().max(120).nullable().optional(),
  cardNumber: z.string().max(40).nullable().optional(),
  variant: z.string().max(80).nullable().optional(),
  estimatedValue: z.number().min(0).max(100000)
}).refine((value) => value.timestampEnd > value.timestampStart, {
  message: "Moment end must be after start.",
  path: ["timestampEnd"]
});

const ReviewSchema = z.object({
  moments: z.array(MomentReviewSchema)
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const parsed = ReviewSchema.parse(await request.json());

  const { data: project } = await supabase
    .from("clip_projects")
    .select("id,total_cost")
    .eq("id", id)
    .eq("user_id", user.id)
    .single<{ id: string; total_cost: number }>();

  if (!project) {
    return NextResponse.json({ error: "Clip project not found." }, { status: 404 });
  }

  for (const [index, moment] of parsed.moments.entries()) {
    const { error: momentError } = await supabase
      .from("clip_moments")
      .update({
        timestamp_start: moment.timestampStart,
        timestamp_end: moment.timestampEnd,
        include_in_export: moment.includeInExport,
        sort_order: index
      })
      .eq("id", moment.momentId)
      .eq("project_id", project.id);

    if (momentError) {
      return NextResponse.json({ error: momentError.message }, { status: 500 });
    }

    const { data: existing } = await supabase
      .from("clip_cards")
      .select("id")
      .eq("moment_id", moment.momentId)
      .eq("project_id", project.id)
      .maybeSingle<{ id: string }>();

    const cardPayload = {
      project_id: project.id,
      moment_id: moment.momentId,
      card_name: moment.cardName,
      set_name: moment.setName,
      card_number: moment.cardNumber,
      variant: moment.variant,
      estimated_value: moment.estimatedValue,
      confidence: moment.cardName ? 1 : 0,
      pricing_source: "manual",
      recognition_source: "manual",
      user_confirmed: Boolean(moment.cardName || moment.estimatedValue),
      updated_at: new Date().toISOString()
    };

    const { error: cardError } = existing
      ? await supabase.from("clip_cards").update(cardPayload).eq("id", existing.id).eq("project_id", project.id)
      : await supabase.from("clip_cards").insert(cardPayload);

    if (cardError) {
      return NextResponse.json({ error: cardError.message }, { status: 500 });
    }
  }

  const includedMomentIds = parsed.moments.filter((moment) => moment.includeInExport).map((moment) => moment.momentId);
  const includedCards = parsed.moments
    .filter((moment) => includedMomentIds.includes(moment.momentId))
    .map((moment) => ({ estimated_value: moment.estimatedValue }));
  const totals = calculateClipTotals(project.total_cost, includedCards);

  const { error: updateError } = await supabase
    .from("clip_projects")
    .update({
      status: "ready_to_export",
      total_pull_value: totals.totalPullValue,
      profit_loss: totals.profitLoss,
      roi_percent: totals.roiPercent,
      updated_at: new Date().toISOString()
    })
    .eq("id", project.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json(totals);
}
