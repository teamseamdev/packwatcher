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

select
  id,
  name,
  file_size_limit,
  round(file_size_limit / 1024.0 / 1024.0 / 1024.0, 2) as file_size_limit_gb,
  allowed_mime_types
from storage.buckets
where id in ('clip-source-videos', 'clip-exports');
