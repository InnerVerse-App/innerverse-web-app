// Shared field names for the post-session form. NarrativeForm renders
// inputs with these names; submitSessionResponse reads them from the
// FormData. Co-locating the constants prevents a typo on either side
// from silently swallowing user-submitted text.
export const POST_SESSION_RESPONSE_FIELD = "user_response_text";
export const ALIGNED_RATING_FIELD = "aligned_rating";
export const HELPFUL_RATING_FIELD = "helpful_rating";
export const TONE_RATING_FIELD = "tone_rating";
export const SESSION_REFLECTION_FIELD = "session_reflection";
