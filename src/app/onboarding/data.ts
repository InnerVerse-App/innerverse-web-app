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

export type GoalOption = { value: string; label: string };
export type GoalCategory = { name: string; goals: GoalOption[] };

export const GOAL_CATEGORIES: GoalCategory[] = [
  {
    name: "Personal Growth",
    goals: [
      { value: "build_self_confidence", label: "Build self-confidence" },
      { value: "develop_emotional_intelligence", label: "Develop emotional intelligence" },
      { value: "overcome_limiting_beliefs", label: "Overcome limiting beliefs" },
      { value: "increase_self_awareness", label: "Increase self-awareness" },
      { value: "practice_mindfulness", label: "Practice mindfulness" },
    ],
  },
  {
    name: "Career & Purpose",
    goals: [
      { value: "advance_your_career", label: "Advance your career" },
      { value: "improve_leadership_skills", label: "Improve leadership skills" },
      { value: "better_work_life_balance", label: "Better work-life balance" },
      { value: "start_a_business", label: "Start a business" },
      { value: "change_careers", label: "Change careers" },
    ],
  },
  {
    name: "Relationships",
    goals: [
      { value: "improve_communication", label: "Improve communication" },
      { value: "build_stronger_relationships", label: "Build stronger relationships" },
      { value: "set_healthy_boundaries", label: "Set healthy boundaries" },
      { value: "find_romantic_partner", label: "Find romantic partner" },
      { value: "resolve_conflicts", label: "Resolve conflicts" },
    ],
  },
  {
    name: "Health & Wellness",
    goals: [
      { value: "reduce_stress_anxiety", label: "Reduce stress & anxiety" },
      { value: "improve_sleep_habits", label: "Improve sleep habits" },
      { value: "build_healthy_routines", label: "Build healthy routines" },
      { value: "increase_energy_levels", label: "Increase energy levels" },
      { value: "practice_self_care", label: "Practice self-care" },
    ],
  },
  {
    name: "Life Direction",
    goals: [
      { value: "find_whats_holding_you_back", label: "Find what's holding you back" },
      { value: "set_meaningful_goals", label: "Set meaningful goals" },
      { value: "make_important_decisions", label: "Make important decisions" },
      { value: "create_life_vision", label: "Create life vision" },
      { value: "find_motivation", label: "Find motivation" },
    ],
  },
];

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

export type CoachingStyleOption = {
  value: string;
  label: string;
  description: string;
  exampleQuestion: string;
  recommended?: boolean;
};

export const COACHING_STYLES: CoachingStyleOption[] = [
  {
    value: "direct",
    label: "Direct",
    description: "Straightforward, challenging questions that push you to think deeper",
    exampleQuestion: "What are you avoiding that's holding you back?",
  },
  {
    value: "gentle",
    label: "Gentle",
    description: "Supportive, nurturing approach with encouraging questions",
    exampleQuestion: "Is there a step you're hesitant to take even though you know it matters?",
  },
  {
    value: "centered",
    label: "Centered",
    description: "Mix of supportive and challenging, adapting to your needs",
    exampleQuestion: "What's one truth you have been avoiding that could actually set things in motion?",
    recommended: true,
  },
];

export type CoachOption = {
  value: string;
  label: string;
  description: string;
  recommended?: boolean;
};

export const COACHES: CoachOption[] = [
  { value: "buddy", label: "Buddy", description: "Friendly and encouraging, like having a supportive friend" },
  { value: "dante", label: "Dante", description: "Wise and thoughtful, guides you through deep reflections" },
  { value: "edith", label: "Edith", description: "Nurturing and patient, creates a safe space for growth" },
  { value: "kelly", label: "Kelly", description: "Energetic and motivating, helps you take action" },
  { value: "lulu", label: "Lulu", description: "Creative and intuitive, brings fresh perspectives" },
  { value: "maya", label: "Maya", description: "Calm and centered, helps you find inner peace", recommended: true },
  { value: "orion", label: "Orion", description: "Adventurous and bold, encourages you to explore new paths" },
  { value: "pierre", label: "Pierre", description: "Sophisticated and insightful, offers elegant solutions" },
  { value: "riley", label: "Riley", description: "Playful and optimistic, makes growth feel fun" },
  { value: "sigmund", label: "Sigmund", description: "Analytical and deep, helps you understand yourself better" },
];

export const TOTAL_STEPS = 6;
export const COACH_NOTES_MAX = 500;
export const TOP_GOALS_INPUT_MAX = 500;
