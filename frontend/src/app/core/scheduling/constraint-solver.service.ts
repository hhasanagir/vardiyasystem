import { Injectable } from '@angular/core';
import type {
  Schedule,
  ShiftAssignment,
  Personnel,
  Device,
  Constraint,
  ValidationResult,
} from '../../domain';
import type { ShiftType, UnitType, ConstraintType } from '../../domain/enums';
import { ConstraintTypeEnum } from '../../domain/enums';
import { SHIFT_TIMES, CONSTRAINT_LIMITS } from '../../domain';
import { ComprehensiveConstraintValidatorService } from './comprehensive-constraint-validator.service';
import { FatigueEngineService } from './fatigue-engine.service';
import { RebalanceEngineService, RebalanceScore } from './rebalance-engine.service';

export interface SolverConfig {
  maxIterations: number;
  populationSize: number;
  mutationRate: number;
  crossoverRate: number;
  eliteRatio: number;
  earlyStopGenerations: number;
}

export interface SolverResult {
  schedule: Schedule;
  score: RebalanceScore;
  validation: ValidationResult;
  iterations: number;
  generationTime: number;
  history: SolverHistoryEntry[];
  converged: boolean;
}

export interface SolverHistoryEntry {
  iteration: number;
  score: number;
  violations: number;
  bestScore: number;
}

export interface CandidateSchedule {
  assignments: ShiftAssignment[];
  score: number;
  violations: Constraint[];
}

@Injectable({ providedIn: 'root' })
export class ConstraintSolverService {
  private defaultConfig: SolverConfig = {
    maxIterations: 500,
    populationSize: 50,
    mutationRate: 0.15,
    crossoverRate: 0.7,
    eliteRatio: 0.1,
    earlyStopGenerations: 50,
  };

  constructor(
    private constraintValidator: ComprehensiveConstraintValidatorService,
    private fatigueEngine: FatigueEngineService,
    private rebalanceEngine: RebalanceEngineService,
  ) {}

  solve(
    initialSchedule: Schedule,
    personnel: Personnel[],
    devices: Device[],
    config: Partial<SolverConfig> = {},
  ): SolverResult {
    const startTime = performance.now();
    const cfg = { ...this.defaultConfig, ...config };

    let population = this.initializePopulation(initialSchedule, personnel, cfg.populationSize);
    let bestCandidate = this.evaluatePopulation(population, personnel)[0];
    let history: SolverHistoryEntry[] = [];
    let generationsWithoutImprovement = 0;

    for (let iteration = 0; iteration < cfg.maxIterations; iteration++) {
      const evaluated = this.evaluatePopulation(population, personnel);
      const currentBest = evaluated[0];

      history.push({
        iteration,
        score: currentBest.score,
        violations: currentBest.violations.length,
        bestScore: bestCandidate.score,
      });

      if (currentBest.score > bestCandidate.score) {
        bestCandidate = currentBest;
        generationsWithoutImprovement = 0;
      } else {
        generationsWithoutImprovement++;
      }

      if (generationsWithoutImprovement >= cfg.earlyStopGenerations) {
        break;
      }

      const elites = evaluated.slice(0, Math.floor(cfg.populationSize * cfg.eliteRatio));
      const offspring = this.generateOffspring(evaluated, cfg, personnel);

      population = [...elites, ...offspring];
    }

    const finalSchedule: Schedule = {
      ...initialSchedule,
      assignments: bestCandidate.assignments,
      version: initialSchedule.version + 1,
      updatedAt: new Date(),
    };

    const validation = this.validateFinalSchedule(finalSchedule, personnel, devices);

    return {
      schedule: finalSchedule,
      score: this.rebalanceEngine.calculateScore(finalSchedule, personnel),
      validation,
      iterations: history.length,
      generationTime: performance.now() - startTime,
      history,
      converged: generationsWithoutImprovement >= cfg.earlyStopGenerations,
    };
  }

  optimize(schedule: Schedule, personnel: Personnel[], devices: Device[]): Schedule {
    const result = this.solve(schedule, personnel, devices);
    return result.schedule;
  }

  private initializePopulation(
    baseSchedule: Schedule,
    personnel: Personnel[],
    size: number,
  ): CandidateSchedule[] {
    const population: CandidateSchedule[] = [];

    population.push({
      assignments: JSON.parse(JSON.stringify(baseSchedule.assignments)),
      score: 0,
      violations: [],
    });

    for (let i = 1; i < size; i++) {
      const mutated = this.mutateSchedule(
        JSON.parse(JSON.stringify(baseSchedule.assignments)),
        personnel,
        0.3,
      );
      population.push({
        assignments: mutated,
        score: 0,
        violations: [],
      });
    }

    return population;
  }

  private evaluatePopulation(
    population: CandidateSchedule[],
    personnel: Personnel[],
  ): CandidateSchedule[] {
    return population
      .map((candidate) => {
        const violations = this.getViolations(candidate.assignments);
        const score = this.calculateCandidateScore(candidate.assignments, personnel, violations);

        return {
          ...candidate,
          score,
          violations,
        };
      })
      .sort((a, b) => b.score - a.score);
  }

  private generateOffspring(
    population: CandidateSchedule[],
    config: SolverConfig,
    personnel: Personnel[],
  ): CandidateSchedule[] {
    const offspring: CandidateSchedule[] = [];
    const targetSize = Math.floor(config.populationSize * (1 - config.eliteRatio));

    while (offspring.length < targetSize) {
      const parent1 = this.tournamentSelect(population, 3);
      const parent2 = this.tournamentSelect(population, 3);

      let child: ShiftAssignment[];

      if (Math.random() < config.crossoverRate) {
        child = this.crossover(parent1.assignments, parent2.assignments);
      } else {
        child = Math.random() > 0.5 ? [...parent1.assignments] : [...parent2.assignments];
      }

      if (Math.random() < config.mutationRate) {
        child = this.mutateSchedule(child, personnel, 0.2);
      }

      offspring.push({
        assignments: child,
        score: 0,
        violations: [],
      });
    }

    return offspring;
  }

  private tournamentSelect(
    population: CandidateSchedule[],
    tournamentSize: number,
  ): CandidateSchedule {
    const tournament: CandidateSchedule[] = [];

    for (let i = 0; i < tournamentSize; i++) {
      const randomIndex = Math.floor(Math.random() * population.length);
      tournament.push(population[randomIndex]);
    }

    return tournament.sort((a, b) => b.score - a.score)[0];
  }

  private crossover(parent1: ShiftAssignment[], parent2: ShiftAssignment[]): ShiftAssignment[] {
    const child: ShiftAssignment[] = [];
    const minLength = Math.min(parent1.length, parent2.length);
    const crossoverPoint = Math.floor(Math.random() * minLength);

    for (let i = 0; i < parent1.length; i++) {
      if (i < crossoverPoint && parent1[i]) {
        child.push(JSON.parse(JSON.stringify(parent1[i])));
      } else if (parent2[i]) {
        child.push(JSON.parse(JSON.stringify(parent2[i])));
      }
    }

    return child;
  }

  private mutateSchedule(
    assignments: ShiftAssignment[],
    personnel: Personnel[],
    mutationIntensity: number,
  ): ShiftAssignment[] {
    const mutated = [...assignments];
    const mutationCount = Math.max(1, Math.floor(assignments.length * mutationIntensity * 0.1));

    for (let i = 0; i < mutationCount; i++) {
      const mutationType = Math.random();

      if (mutationType < 0.4) {
        const idx = Math.floor(Math.random() * mutated.length);
        const availablePersonnel = this.getAvailablePersonnelForAssignment(
          mutated[idx],
          personnel,
          mutated,
        );

        if (availablePersonnel.length > 0) {
          const newPersonnel =
            availablePersonnel[Math.floor(Math.random() * availablePersonnel.length)];
          mutated[idx] = { ...mutated[idx], personnelId: newPersonnel.id };
        }
      } else if (mutationType < 0.7) {
        const idx = Math.floor(Math.random() * mutated.length);
        const currentType = mutated[idx].shiftType;
        const newType: ShiftType =
          currentType === 'day' ? 'night' : currentType === 'night' ? 'day' : 'evening';
        const shiftTime = SHIFT_TIMES[newType];

        mutated[idx] = {
          ...mutated[idx],
          shiftType: newType,
          startTime: `${String(shiftTime.start).padStart(2, '0')}:00`,
          endTime: `${String(shiftTime.end).padStart(2, '0')}:00`,
        };
      } else {
        const idx1 = Math.floor(Math.random() * mutated.length);
        let idx2 = Math.floor(Math.random() * mutated.length);

        while (idx2 === idx1) {
          idx2 = Math.floor(Math.random() * mutated.length);
        }

        const temp = mutated[idx1].personnelId;
        mutated[idx1] = { ...mutated[idx1], personnelId: mutated[idx2].personnelId };
        mutated[idx2] = { ...mutated[idx2], personnelId: temp };
      }
    }

    return mutated;
  }

  private getAvailablePersonnelForAssignment(
    assignment: ShiftAssignment,
    allPersonnel: Personnel[],
    existingAssignments: ShiftAssignment[],
  ): Personnel[] {
    const unitPersonnel = allPersonnel.filter((p) => p.isActive);

    return unitPersonnel.filter((person) => {
      const hasConflict = existingAssignments.some(
        (a) => a.personnelId === person.id && a.date === assignment.date && a.id !== assignment.id,
      );

      if (hasConflict) return false;

      const dayAssignments = existingAssignments.filter(
        (a) => a.personnelId === person.id && a.date === assignment.date,
      );

      if (dayAssignments.length > 0) return false;

      return true;
    });
  }

  private getViolations(assignments: ShiftAssignment[]): Constraint[] {
    const violations: Constraint[] = [];

    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (assignments[i].date !== assignments[j].date) continue;
        if (assignments[i].personnelId !== assignments[j].personnelId) continue;

        violations.push({
          type: ConstraintTypeEnum.DOUBLE_ASSIGNMENT,
          message: `${assignments[i].personnelId} aynı günde iki kez atandı`,
          severity: 'error',
          affectedAssignments: [assignments[i].id, assignments[j].id],
        });
      }
    }

    const byPersonnel = new Map<string, ShiftAssignment[]>();
    for (const assignment of assignments) {
      const list = byPersonnel.get(assignment.personnelId) || [];
      list.push(assignment);
      byPersonnel.set(assignment.personnelId, list);
    }

    for (const [personnelId, personAssignments] of byPersonnel) {
      const sorted = personAssignments.sort((a, b) => a.date.localeCompare(b.date));

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];

        const prevEnd = this.parseTime(prev.endTime);
        const currStart = this.parseTime(curr.startTime);
        const daysDiff = this.daysBetween(prev.date, curr.date);

        let hoursBetween: number;
        if (daysDiff === 0) {
          hoursBetween = currStart - prevEnd;
        } else {
          hoursBetween = 24 - prevEnd + currStart + (daysDiff - 1) * 24;
        }

        if (hoursBetween < CONSTRAINT_LIMITS.MIN_REST_HOURS && hoursBetween >= 0) {
          violations.push({
            type: 'min_rest',
            message: `${personnelId} için yetersiz dinlenme süresi (${hoursBetween.toFixed(1)} saat)`,
            severity: 'error',
            affectedAssignments: [prev.id, curr.id],
          });
        }
      }
    }

    return violations;
  }

  private calculateCandidateScore(
    assignments: ShiftAssignment[],
    personnel: Personnel[],
    violations: Constraint[],
  ): number {
    if (violations.some((v) => v.severity === 'error')) {
      return -1000 + violations.length * -10;
    }

    const penaltyScore = violations.reduce((sum, v) => {
      if (v.severity === 'warning') return sum - 5;
      return sum - 10;
    }, 0);

    const tempSchedule: Schedule = {
      id: 'temp',
      unit: 'mr' as UnitType,
      month: 1,
      year: 2026,
      assignments,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'draft',
    };

    const rebalanceScore = this.rebalanceEngine.calculateScore(tempSchedule, personnel);

    return rebalanceScore.overall + penaltyScore;
  }

  private validateFinalSchedule(
    schedule: Schedule,
    personnel: Personnel[],
    devices: Device[],
  ): ValidationResult {
    const violations = this.getViolations(schedule.assignments);
    const warnings = this.getWarnings(schedule, personnel);

    return {
      isValid: violations.length === 0,
      errors: violations,
      warnings,
      score: violations.length === 0 ? 100 : Math.max(0, 100 - violations.length * 10),
    };
  }

  private getWarnings(schedule: Schedule, personnel: Personnel[]): Constraint[] {
    const warnings: Constraint[] = [];
    const personnelMap = new Map(personnel.map((p) => [p.id, p]));

    for (const assignment of schedule.assignments) {
      const person = personnelMap.get(assignment.personnelId);
      if (!person) continue;

      const profile = this.fatigueEngine.calculatePersonnelFatigueProfile(
        schedule.assignments.filter((a) => a.personnelId === person.id),
        person,
      );

      if (profile.currentFatigue > 70) {
        warnings.push({
          type: 'min_rest',
          message: `${person.name} için yüksek fatigue riski (${profile.currentFatigue.toFixed(0)}%)`,
          severity: 'warning',
        });
      }
    }

    return warnings;
  }

  private parseTime(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours + minutes / 60;
  }

  private daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  }
}
