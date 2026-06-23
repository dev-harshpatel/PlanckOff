// Public API — Phase 4 imports from here

// Main entry point
export { matchMaterial } from './engine/ruleBasedMatcher';
export type { MatchResult } from './engine/ruleBasedMatcher';

// Result types
export type { ScoredMatch, RuleScore, ScoringRule, MatchConfig } from './types';

// Registry — exported so Phase 4 / tests can inspect registered rules
export { SCORING_RULES, CONFIDENCE_THRESHOLDS } from './rules/registry';
