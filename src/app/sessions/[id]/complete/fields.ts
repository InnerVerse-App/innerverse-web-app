// Field names for the Session Complete feedback form. Shared by
// FeedbackForm (sets <input name={FEEDBACK_FIELDS.x}>) and
// submitSessionFeedback (reads formData.get(FEEDBACK_FIELDS.x)),
// so a typo on either side can't silently break submission.
export const FEEDBACK_FIELDS = {
  REFLECTION: "reflection",
  SUPPORTIVE_RATING: "supportive_rating",
  HELPFUL_RATING: "helpful_rating",
  ALIGNED_RATING: "aligned_rating",
  ADDITIONAL_FEEDBACK: "additional_feedback",
} as const;
