update storage.buckets
set
  file_size_limit = 5368709120,
  allowed_mime_types = array['video/mp4', 'video/quicktime', 'video/webm']
where id = 'clip-source-videos';

update storage.buckets
set
  file_size_limit = 5368709120,
  allowed_mime_types = array['video/mp4']
where id = 'clip-exports';
