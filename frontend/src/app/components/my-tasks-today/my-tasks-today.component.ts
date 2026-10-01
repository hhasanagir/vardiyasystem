import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ShiftTasksService, ShiftTask, TaskProgress } from '../../services/shift-tasks.service';

@Component({
  selector: 'app-my-tasks-today',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card task-card">
      <div class="card-header">
        <h3>Bugünkü Görevlerim</h3>
        <span class="badge badge-neutral">{{ progress().completed }}/{{ progress().total }}</span>
      </div>
      <div class="task-progress">
        <div class="progress-bar">
          <div class="progress-fill" [style.width.%]="progress().percentage"></div>
        </div>
        <span class="progress-text">%{{ progress().percentage }} tamamlandı</span>
      </div>
      <div class="task-list">
        @for (task of tasks(); track task.id) {
          <label
            class="task-item"
            [class.completed]="task.status === 'completed'"
            [class.skipped]="task.status === 'skipped'"
          >
            <input
              type="checkbox"
              [checked]="task.status === 'completed'"
              (change)="toggleTask(task)"
              [disabled]="toggling() === task.id"
            />
            <span class="checkmark"></span>
            <span class="task-label">{{ task.label }}</span>
            @if (task.status === 'completed') {
              <span class="task-done">✓</span>
            }
          </label>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .task-card {
        background: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        padding: 16px;
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .card-header h3 {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
      }
      .task-progress {
        margin-bottom: 12px;
      }
      .progress-bar {
        height: 4px;
        border-radius: 2px;
        background: var(--border-subtle);
        overflow: hidden;
      }
      .progress-fill {
        height: 100%;
        background: var(--accent-mr);
        transition: width 0.3s ease;
        border-radius: 2px;
      }
      .progress-text {
        font-size: 11px;
        color: var(--text-muted);
        margin-top: 4px;
        display: block;
      }
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .task-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: background var(--transition-fast);
        font-size: 13px;
        color: var(--text-secondary);
        position: relative;
      }
      .task-item:hover {
        background: var(--bg-hover);
      }
      .task-item.completed {
        opacity: 0.6;
        text-decoration: line-through;
      }
      .task-item.skipped {
        opacity: 0.5;
      }
      .task-item input[type='checkbox'] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
        pointer-events: none;
      }
      .checkmark {
        width: 18px;
        height: 18px;
        border: 2px solid var(--border-default);
        border-radius: 4px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--transition-fast);
      }
      .task-item input:checked + .checkmark {
        background: var(--accent-mr);
        border-color: var(--accent-mr);
      }
      .task-item input:checked + .checkmark::after {
        content: '✓';
        color: #fff;
        font-size: 12px;
        font-weight: 700;
        line-height: 1;
      }
      .task-done {
        color: var(--status-success);
        font-size: 12px;
        margin-left: auto;
      }
    `,
  ],
})
export class MyTasksTodayComponent implements OnInit {
  private shiftTasksService = inject(ShiftTasksService);

  protected tasks = signal<ShiftTask[]>([]);
  protected progress = computed<TaskProgress>(() => {
    const list = this.tasks();
    const total = list.length;
    const completed = list.filter((t) => t.status === 'completed').length;
    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });
  protected toggling = signal<string | null>(null);

  ngOnInit() {
    this.loadTasks();
  }

  private loadTasks() {
    this.shiftTasksService.getTodayTasks().subscribe((tasks) => {
      this.tasks.set(tasks);
    });
  }

  protected toggleTask(task: ShiftTask) {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    this.toggling.set(task.id);

    this.shiftTasksService.updateTaskStatus(task.id, newStatus).subscribe({
      next: (updated) => {
        this.tasks.update((list) => list.map((t) => (t.id === updated.id ? updated : t)));
        this.toggling.set(null);
      },
      error: () => {
        this.toggling.set(null);
      },
    });
  }
}
