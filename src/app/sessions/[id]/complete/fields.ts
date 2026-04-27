// Shared field name for the post-session reflection form.
// NarrativeForm sets <textarea name={POST_SESSION_RESPONSE_FIELD}>;
// submitSessionResponse reads formData.get(POST_SESSION_RESPONSE_FIELD).
// Co-locating the constant prevents a typo on either side from
// silently swallowing user-submitted text.
export const POST_SESSION_RESPONSE_FIELD = "user_response_text";
