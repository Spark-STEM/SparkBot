// Generated from the configured remote D1 database by scripts/generate-registry.mjs. Do not edit by hand.
export interface TableRows {
  "chapters": {
    "id": number;
    "country": string;
    "region": string | null;
    "city": string;
    "name": string | null;
  };
  "roles": {
    "id": number;
    "name": string;
    "description": string | null;
  };
  "schools": {
    "id": number;
    "chapter_id": number | null;
    "name": string;
    "link": string | null;
    "cover_image": string | null;
    "address": string | null;
    "latitude": number | null;
    "longitude": number | null;
  };
  "programs": {
    "id": number;
    "school_id": number | null;
    "name": string;
    "description": string | null;
    "min_grade": number | null;
    "max_grade": number | null;
    "status": string | null;
    "start_date": string | null;
    "end_date": string | null;
    "student_count": number | null;
    "tutor_count": number | null;
    "fee": number | string | null;
    "location": string | null;
  };
  "program_schedules": {
    "id": number;
    "program_id": number | null;
    "runs_mon": number | null;
    "runs_tue": number | null;
    "runs_wed": number | null;
    "runs_thu": number | null;
    "runs_fri": number | null;
    "start_time": string;
    "end_time": string;
  };
  "members": {
    "id": number;
    "chapter_id": number | null;
    "name": string;
    "email": string | null;
    "hours": number | null;
    "discord_id": string | null;
  };
  "member_roles": {
    "member_id": number;
    "role_id": number;
  };
  "sessions": {
    "id": number;
    "program_id": number | null;
    "time": number;
  };
  "session_members": {
    "session_id": number;
    "member_id": number;
  };
}
