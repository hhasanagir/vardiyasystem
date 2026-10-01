# Phase 5B.3 — Test Fixture Scenarios

## Overview

12 deterministic test scenarios (A-L) plus 3 size variants used for quality gate validation.

## Scenario Catalog

| Scenario | Name                      | Purpose                           | Personnel | Devices |
| -------- | ------------------------- | --------------------------------- | --------- | ------- |
| A        | Simple Valid Schedule     | Baseline happy path               | 3         | 1       |
| B        | Personnel Overlap         | Existing assignment conflicts     | 3         | 1       |
| C        | Insufficient Rest         | Night shift + rest violation      | 3         | 1       |
| D        | Personnel Unavailable     | Inactive personnel excluded       | 2         | 1       |
| E        | Resource Overlap          | Single person, night config       | 1         | 1       |
| F        | Missing Competency        | Skill mismatch filtering          | 2         | 1       |
| G        | Uneven Workload           | Heavy imbalance detection         | 2         | 1       |
| H        | Uneven Night Distribution | Night shift imbalance             | 2         | 1       |
| I        | Weekend Imbalance         | Off-day patterns                  | 2         | 1       |
| J        | Mixed Valid/Invalid       | Pre-existing valid + new          | 2         | 1       |
| K        | Imaging                   | Service line = IMAGING            | 2         | 2       |
| L        | Radiation Oncology        | Service line = RADIATION_ONCOLOGY | 1         | 1       |

## Size Variants

- **Small:** 10 personnel, 1 device
- **Medium:** 50 personnel, 5 devices
- **Large:** 200 personnel, 20 devices

## Design Principles

1. **Deterministic:** No random elements; identical inputs → identical outputs
2. **Isolated:** Each scenario tests one specific concern
3. **Reproducible:** Date-fixed to January 2026 (known weekday layout)
4. **In-memory:** No database dependency; uses `AssignmentCollection` directly
