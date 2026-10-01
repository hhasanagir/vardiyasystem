import { Component, input, ChangeDetectionStrategy, contentChild } from '@angular/core';

@Component({
  selector: 'app-form-field',
  standalone: true,
  template: `
    <div
      class="form-field"
      [class.form-field-error]="!!error()"
      [class.form-field-disabled]="disabled()"
    >
      @if (label()) {
        <label class="form-label" [attr.for]="for()">
          {{ label() }}
          @if (required()) {
            <span class="form-required" aria-hidden="true">*</span>
          }
        </label>
      }
      <div class="form-control-wrapper">
        <ng-content />
      </div>
      @if (hint() && !error()) {
        <p class="form-hint">{{ hint() }}</p>
      }
      @if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      }
      @if (charCount() && maxLength()) {
        <p class="form-charcount">{{ charCount() }} / {{ maxLength() }}</p>
      }
    </div>
  `,
  styles: [
    `
      .form-field {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }
      .form-label {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--text-primary);
      }
      .form-required {
        color: var(--status-danger);
        margin-left: 0.125rem;
      }
      .form-hint {
        font-size: 0.75rem;
        color: var(--text-muted);
        margin: 0;
      }
      .form-error {
        font-size: 0.75rem;
        color: var(--status-danger);
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }
      .form-charcount {
        font-size: 0.7rem;
        color: var(--text-muted);
        margin: 0;
        text-align: right;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FormFieldComponent {
  readonly label = input('');
  readonly for = input('');
  readonly required = input(false);
  readonly error = input('');
  readonly hint = input('');
  readonly disabled = input(false);
  readonly charCount = input(0);
  readonly maxLength = input(0);
}
