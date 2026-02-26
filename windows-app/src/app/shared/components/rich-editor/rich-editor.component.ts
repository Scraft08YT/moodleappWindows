import { Component, input, output, signal, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR, FormsModule } from '@angular/forms';

/**
 * Simple rich-text editor component using contenteditable.
 * Provides basic formatting (bold, italic, underline, lists)
 * and integrates with Angular forms via ControlValueAccessor.
 */
@Component({
    selector: 'app-rich-editor',
    standalone: true,
    imports: [FormsModule],
    templateUrl: './rich-editor.component.html',
    styleUrl: './rich-editor.component.scss',
    providers: [
        {
            provide: NG_VALUE_ACCESSOR,
            useExisting: forwardRef(() => RichEditorComponent),
            multi: true,
        },
    ],
})
export class RichEditorComponent implements ControlValueAccessor {

    readonly placeholder = input('Schreibe hier...');
    readonly minHeight = input('120px');
    readonly valueChange = output<string>();

    readonly html = signal('');
    readonly disabled = signal(false);

    private onChange: (value: string) => void = () => { /* noop */ };
    private onTouched: () => void = () => { /* noop */ };

    writeValue(value: string): void {
        this.html.set(value ?? '');
    }

    registerOnChange(fn: (value: string) => void): void {
        this.onChange = fn;
    }

    registerOnTouched(fn: () => void): void {
        this.onTouched = fn;
    }

    setDisabledState(isDisabled: boolean): void {
        this.disabled.set(isDisabled);
    }

    onInput(event: Event): void {
        const el = event.target as HTMLElement;
        const value = el.innerHTML;
        this.html.set(value);
        this.onChange(value);
        this.valueChange.emit(value);
    }

    onBlur(): void {
        this.onTouched();
    }

    execCommand(command: string, value?: string): void {
        document.execCommand(command, false, value);
    }

    insertLink(): void {
        const url = prompt('URL eingeben:');
        if (url) {
            document.execCommand('createLink', false, url);
        }
    }
}
