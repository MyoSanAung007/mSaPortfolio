import { Component, ChangeDetectorRef } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AnimationModule } from './animations';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [AnimationModule, FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly title = 'Myo San Aung | Portfolio';

  formData = {
    name: '',
    email: '',
    subject: '',
    message: ''
  };

  isSubmitting = false;
  submitSuccess = false;
  submitError = false;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  onSubmit() {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    const headers = new HttpHeaders({ Accept: 'application/json' });

    const payload = {
      name: this.formData.name,
      email: this.formData.email,
      subject: this.formData.subject,
      message: this.formData.message
    };

    this.http.post('https://formspree.io/f/xqeojkgv', payload, { headers }).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.submitSuccess = true;
        this.formData = { name: '', email: '', subject: '', message: '' };
        this.cdr.markForCheck();

        setTimeout(() => {
          this.submitSuccess = false;
          this.cdr.markForCheck();
        }, 5000);
      },
      error: () => {
        this.isSubmitting = false;
        this.submitError = true;
        this.cdr.markForCheck();

        setTimeout(() => {
          this.submitError = false;
          this.cdr.markForCheck();
        }, 5000);
      }
    });
  }
}

