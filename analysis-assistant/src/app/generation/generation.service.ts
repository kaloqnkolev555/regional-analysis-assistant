import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, InjectionToken } from '@angular/core';
import { Observable, delay, map, of } from 'rxjs';

export interface GenerationRequest {
  briefing: string;
  priorities: Array<{ id: string; text: string }>;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface GenerationResponse {
  text: string;
}

export type GenerationMode = 'mock' | 'http';

export const GENERATION_MODE = new InjectionToken<GenerationMode>('GENERATION_MODE', {
  providedIn: 'root',
  factory: () => 'mock',
});

@Injectable({ providedIn: 'root' })
export class GenerationService {
  constructor(
    private readonly http: HttpClient,
    @Inject(GENERATION_MODE) readonly mode: GenerationMode,
  ) {}

  generate(request: GenerationRequest): Observable<GenerationResponse> {
    if (this.mode === 'http') {
      return this.http.post<GenerationResponse>('/api/generate', request).pipe(
        map((response) => {
          if (!response || typeof response.text !== 'string') {
            throw new Error('The generation service returned an invalid response.');
          }
          return response;
        }),
      );
    }

    const recommendations = request.priorities
      .map(
        (priority, index) =>
          `${index + 1}. ${priority.text}\n` +
          '   Start with a focused, measurable pilot; phase delivery to fit local capacity and available funding.',
      )
      .join('\n\n');

    return of({
      text:
        'mock data\n\n' +
        recommendations,
    }).pipe(delay(300));
  }
}
