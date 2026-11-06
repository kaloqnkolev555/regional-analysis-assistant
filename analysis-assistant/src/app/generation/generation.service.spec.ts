import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { lastValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { GENERATION_MODE, GenerationService, type GenerationRequest } from './generation.service';

const request: GenerationRequest = {
  briefing: 'Regional briefing',
  priorities: [{ id: 'priority-1', text: 'Improve rural transport' }],
  messages: [{ role: 'user', content: 'Generate recommendations.' }],
};

describe('GenerationService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('returns mock JSON in mock mode', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GENERATION_MODE, useValue: 'mock' },
      ],
    });
    const service = TestBed.inject(GenerationService);
    const result = await lastValueFrom(service.generate(request));

    expect(service.mode).toBe('mock');
    expect(result).toEqual({
      text: expect.stringContaining('Improve rural transport'),
    });
    TestBed.inject(HttpTestingController).expectNone('/api/generate');
  });

  it('posts the request and returns JSON in HTTP mode', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GENERATION_MODE, useValue: 'http' },
      ],
    });
    const service = TestBed.inject(GenerationService);
    const controller = TestBed.inject(HttpTestingController);
    const result = lastValueFrom(service.generate(request));
    const req = controller.expectOne('/api/generate');

    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ text: 'Recommendations from the API.' });
    await expect(result).resolves.toEqual({ text: 'Recommendations from the API.' });
  });

  it('keeps HTTP errors as errors without returning mock content', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GENERATION_MODE, useValue: 'http' },
      ],
    });
    const service = TestBed.inject(GenerationService);
    const controller = TestBed.inject(HttpTestingController);
    const result = lastValueFrom(service.generate(request));
    controller.expectOne('/api/generate').flush(
      { message: 'Backend unavailable.' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    await expect(result).rejects.toBeInstanceOf(HttpErrorResponse);
  });

  it('rejects a response without a text string', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GENERATION_MODE, useValue: 'http' },
      ],
    });
    const service = TestBed.inject(GenerationService);
    const controller = TestBed.inject(HttpTestingController);
    const result = lastValueFrom(service.generate(request));
    controller.expectOne('/api/generate').flush({ text: 42 });

    await expect(result).rejects.toThrow('invalid response');
  });

  it('cancels the HTTP request when unsubscribed', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: GENERATION_MODE, useValue: 'http' },
      ],
    });
    const service = TestBed.inject(GenerationService);
    const subscription = service.generate(request).subscribe();
    const req = TestBed.inject(HttpTestingController).expectOne('/api/generate');

    subscription.unsubscribe();

    expect(req.cancelled).toBe(true);
  });
});
