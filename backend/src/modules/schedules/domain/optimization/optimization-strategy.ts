import { SchedulingProblem } from './scheduling-problem';
import { CandidateSchedule } from './candidate-schedule';
import { OptimizationResult } from './optimization-result';

export interface OptimizationContext {
  maxIterations: number;
  timeLimitMs: number;
  strategyConfig: Record<string, unknown>;
}

export interface OptimizationStrategy {
  id: string;
  name: string;
  optimize(
    problem: SchedulingProblem,
    context: OptimizationContext,
  ): OptimizationResult;
}
