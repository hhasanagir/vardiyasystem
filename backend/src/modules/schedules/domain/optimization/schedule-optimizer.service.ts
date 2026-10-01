import {
  SchedulingProblem,
  SchedulingProblemConfig,
} from './scheduling-problem';
import {
  OptimizationStrategy,
  OptimizationContext,
} from './optimization-strategy';
import { OptimizationResult } from './optimization-result';
import { GreedyOptimizationStrategy } from './greedy-strategy';
import {
  createSchedulingStrategy,
  ServiceLine,
} from '../strategies/scheduling-strategy';

export {
  SchedulingProblem,
  SchedulingProblemConfig,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
  SchedulingProblemShiftDef,
} from './scheduling-problem';
export {
  CandidateSchedule,
  CandidateAssignment,
  createEmptyCandidate,
} from './candidate-schedule';
export {
  OptimizationResult,
  OptimizationSummary,
  OptimizationMetadata,
  ScoreComponent,
  createOptimizationResult,
} from './optimization-result';
export {
  OptimizationStrategy,
  OptimizationContext,
} from './optimization-strategy';
export { GreedyOptimizationStrategy } from './greedy-strategy';
export {
  ScoreAggregator,
  AggregatedScore,
  ScoreWeights,
} from './score-aggregator';
export {
  CANONICAL_SCORING_WEIGHTS,
  SOFT_CONSTRAINT_WEIGHTS,
  validateCanonicalWeights,
} from './canonical-scoring.config';

export class ScheduleOptimizerService {
  private readonly strategies: Map<string, OptimizationStrategy> = new Map();

  constructor() {
    this.registerStrategy(new GreedyOptimizationStrategy());
  }

  registerStrategy(strategy: OptimizationStrategy): void {
    this.strategies.set(strategy.id, strategy);
  }

  optimize(
    problem: SchedulingProblem,
    strategyId: string = 'greedy',
    config?: Partial<OptimizationContext>,
  ): OptimizationResult {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Unknown optimization strategy: ${strategyId}`);
    }

    const serviceLineStrategy = createSchedulingStrategy(
      problem.serviceLine === 'RADIATION_ONCOLOGY'
        ? ServiceLine.RADIATION_ONCOLOGY
        : ServiceLine.IMAGING,
    );

    const context: OptimizationContext = {
      maxIterations: config?.maxIterations ?? 100,
      timeLimitMs: config?.timeLimitMs ?? 30000,
      strategyConfig: config?.strategyConfig ?? {},
    };

    const result = strategy.optimize(problem, context);

    result.explanations.unshift(
      `Strategy: ${strategy.name}`,
      `Service line: ${serviceLineStrategy.serviceLine}`,
    );

    return result;
  }

  getAvailableStrategies(): Array<{ id: string; name: string }> {
    return Array.from(this.strategies.values()).map((s) => ({
      id: s.id,
      name: s.name,
    }));
  }
}
