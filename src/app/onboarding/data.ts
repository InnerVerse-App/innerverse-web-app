// Onboarding option data — themes, goals, coaching styles, coach names.
// Mirrored from the legacy Bubble app screenshots in
// reference/screenshots/app-ui/. Treated as static constants for v1;
// once the data is stable across testers, consider moving to Supabase
// for editability without a deploy.

export type ThemeOption = { value: string; label: string };

export const THEMES: ThemeOption[] = [
  { value: "build_confidence", label: "Build confidence" },
  { value: "reduce_stress_anxiety", label: "Reduce stress & anxiety" },
  { value: "improve_relationships", label: "Improve relationships" },
  { value: "find_life_direction", label: "Find life direction" },
  { value: "career_growth", label: "Career growth" },
  { value: "better_work_life_balance", label: "Better work-life balance" },
  { value: "overcome_limiting_beliefs", label: "Overcome limiting beliefs" },
  { value: "increase_self_awareness", label: "Increase self-awareness" },
  { value: "goal_achievement", label: "Goal achievement" },
  { value: "personal_development", label: "Personal development" },
  { value: "emotional_regulation", label: "Emotional regulation" },
  { value: "decision_making", label: "Decision making" },
];

export type GoalOption = {
  value: string;
  label: string;
  // Concrete, low-friction starter action surfaced in the user's
  // /next-steps + Goals tab when a predefined goal is freshly seeded.
  // Replaced by an LLM-generated suggested_next_step the moment the
  // first session-end RPC writes one for that goal.
  starter_action: string;
};
export type GoalCategory = { name: string; goals: GoalOption[] };

export const GOAL_CATEGORIES: GoalCategory[] = [
  {
    name: "Personal Growth",
    goals: [
      {
        value: "build_self_confidence",
        label: "Build self-confidence",
        starter_action:
          "List 3 things you've succeeded at this week, no matter how small.",
      },
      {
        value: "develop_emotional_intelligence",
        label: "Develop emotional intelligence",
        starter_action:
          "Notice one strong emotion today and write down what it might be telling you.",
      },
      {
        value: "overcome_limiting_beliefs",
        label: "Overcome limiting beliefs",
        starter_action:
          "Write down one belief you hold about yourself that you suspect isn't fully true.",
      },
      {
        value: "increase_self_awareness",
        label: "Increase self-awareness",
        starter_action:
          "At the end of today, jot down one moment you reacted automatically and what you'd do differently.",
      },
      {
        value: "practice_mindfulness",
        label: "Practice mindfulness",
        starter_action:
          "Take 5 minutes today to sit and notice your breathing. No goal beyond noticing.",
      },
    ],
  },
  {
    name: "Career & Purpose",
    goals: [
      {
        value: "advance_your_career",
        label: "Advance your career",
        starter_action:
          "Write down one specific skill or relationship that would meaningfully advance your career, and one tiny step toward it.",
      },
      {
        value: "improve_leadership_skills",
        label: "Improve leadership skills",
        starter_action:
          "Notice one moment this week where you led, even informally, and ask what made it work or fall short.",
      },
      {
        value: "better_work_life_balance",
        label: "Better work-life balance",
        starter_action:
          "Pick one boundary you'd like to hold this week (for example, no email after 7pm) and try it once.",
      },
      {
        value: "start_a_business",
        label: "Start a business",
        starter_action:
          "Write down the one problem you most want to solve and who, specifically, has it.",
      },
      {
        value: "change_careers",
        label: "Change careers",
        starter_action:
          "Write down one career you keep coming back to in your head and one person who's already in it.",
      },
    ],
  },
  {
    name: "Relationships",
    goals: [
      {
        value: "improve_communication",
        label: "Improve communication",
        starter_action:
          "In your next conversation, notice when you want to interrupt and try waiting 3 seconds before speaking.",
      },
      {
        value: "build_stronger_relationships",
        label: "Build stronger relationships",
        starter_action:
          "Reach out to one person you care about this week with no agenda beyond connection.",
      },
      {
        value: "set_healthy_boundaries",
        label: "Set healthy boundaries",
        starter_action:
          "Identify one ongoing 'yes' that's been costing you and try saying 'not this time' once.",
      },
      {
        value: "find_romantic_partner",
        label: "Find romantic partner",
        starter_action:
          "Write down 3 qualities that matter most to you in a partner, and 3 you can release.",
      },
      {
        value: "resolve_conflicts",
        label: "Resolve conflicts",
        starter_action:
          "Pick one unresolved tension and write what the other person might be feeling, in their words, not yours.",
      },
    ],
  },
  {
    name: "Health & Wellness",
    goals: [
      {
        value: "reduce_stress_anxiety",
        label: "Reduce stress & anxiety",
        starter_action:
          "Identify one source of stress this week and write down whether it's in your control.",
      },
      {
        value: "improve_sleep_habits",
        label: "Improve sleep habits",
        starter_action:
          "Pick one bedtime tonight and stick to it, within 15 minutes.",
      },
      {
        value: "build_healthy_routines",
        label: "Build healthy routines",
        starter_action:
          "Pick one tiny habit (1-5 minutes) and do it at the same time tomorrow.",
      },
      {
        value: "increase_energy_levels",
        label: "Increase energy levels",
        starter_action:
          "Notice when you feel most energetic today and what you were doing right before.",
      },
      {
        value: "practice_self_care",
        label: "Practice self-care",
        starter_action:
          "Schedule 15 minutes for yourself this week and treat it like an appointment.",
      },
    ],
  },
  {
    name: "Life Direction",
    goals: [
      {
        value: "find_whats_holding_you_back",
        label: "Find what's holding you back",
        starter_action:
          "Write down one thing you've been avoiding and what you imagine would happen if you faced it.",
      },
      {
        value: "set_meaningful_goals",
        label: "Set meaningful goals",
        starter_action:
          "Name one criterion that makes a goal feel meaningful to you, and use it to choose your next small goal.",
      },
      {
        value: "make_important_decisions",
        label: "Make important decisions",
        starter_action:
          "Pick one decision you've been postponing and write down what specifically you're afraid of.",
      },
      {
        value: "create_life_vision",
        label: "Create life vision",
        starter_action:
          "Write a 3-sentence description of what your ideal year from now looks like.",
      },
      {
        value: "find_motivation",
        label: "Find motivation",
        starter_action:
          "Notice one thing you did today that didn't require willpower and ask why it felt natural.",
      },
    ],
  },
];

// Generic starter for custom (user-added) goals where we have no
// predefined starter_action. Used by G.4's createGoal flow.
export const CUSTOM_GOAL_GENERIC_STARTER =
  "Take 5 minutes to reflect on what this goal means to you and what early progress would look like.";

export type SatisfactionCategory = {
  key:
    | "work_purpose"
    | "relationships"
    | "health_energy"
    | "confidence_self_worth"
    | "clarity_direction"
    | "freedom_of_choice";
  label: string;
  description: string;
};

export const SATISFACTION_CATEGORIES: SatisfactionCategory[] = [
  {
    key: "work_purpose",
    label: "Work & Purpose",
    description: "Career satisfaction and sense of purpose",
  },
  {
    key: "relationships",
    label: "Relationships",
    description: "Quality of personal and professional relationships",
  },
  {
    key: "health_energy",
    label: "Health & Energy",
    description: "Physical health, energy levels, and self-care",
  },
  {
    key: "confidence_self_worth",
    label: "Confidence & Self-Worth",
    description: "Self-esteem and belief in your abilities",
  },
  {
    key: "clarity_direction",
    label: "Clarity & Direction",
    description: "Clear vision for your future and next steps",
  },
  {
    key: "freedom_of_choice",
    label: "Freedom of Choice",
    description: "Feeling empowered to influence your life",
  },
];

export const SATISFACTION_LABELS: Record<number, string> = {
  1: "Very Dissatisfied",
  2: "Dissatisfied",
  3: "Neutral",
  4: "Satisfied",
  5: "Very Satisfied",
};

export type CoachOption = {
  value: string;
  label: string;
  description: string;
  recommended?: boolean;
};

export const COACHES: CoachOption[] = [
  { value: "buddy", label: "Buddy", description: "Friendly and encouraging, like having a supportive friend" },
  { value: "dante", label: "Dante", description: "Wise and thoughtful, guides you through deep reflections" },
  { value: "kelly", label: "Kelly", description: "Energetic and motivating, helps you take action" },
  { value: "maya", label: "Maya", description: "Calm and centered, helps you find inner peace" },
  { value: "orion", label: "Orion", description: "Adventurous and bold, encourages you to explore new paths" },
  { value: "pierre", label: "Pierre", description: "Sophisticated and insightful, offers elegant solutions" },
  { value: "sigmund", label: "Sigmund", description: "Analytical and deep, helps you understand yourself better" },
];

export const TOTAL_STEPS = 5;
export const COACH_NOTES_MAX = 500;
export const TOP_GOALS_INPUT_MAX = 500;
