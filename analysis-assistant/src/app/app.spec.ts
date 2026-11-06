import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Observable } from 'rxjs';
import { AppComponent, SAMPLE_BRIEFING } from './app';
import { GenerationService } from './generation/generation.service';

const analysisStepDelay = 700;

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('preserves the workspace shell and begins with all steps incomplete', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain(
      'Analyst Workspace: Strategic Recommendations',
    );
    expect(component.completedSteps.size).toBe(0);
    component.goToStep(2);
    component.goToStep(3);
    expect(component.currentStep).toBe(1);
    fixture.destroy();
  });

  it('rejects empty, whitespace-only, and overlong briefings', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    component.briefingText = '';
    component.analyzeBriefing();
    expect(component.briefingError).toContain('required');

    component.briefingText = '   ';
    component.analyzeBriefing();
    expect(component.briefingError).toContain('required');

    component.briefingText = 'x'.repeat(component.maxBriefingLength + 1);
    component.analyzeBriefing();
    expect(component.briefingError).toContain(`${component.maxBriefingLength}`);
    expect(component.isAnalyzing).toBe(false);
    fixture.destroy();
  });

  it('loads the Solana sample and shows the three matching demonstration priorities', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    component.loadSample();
    expect(component.briefingText).toBe(SAMPLE_BRIEFING);
    expect(SAMPLE_BRIEFING).toMatch(/youth unemployment.*skills gaps/is);
    expect(SAMPLE_BRIEFING).toMatch(/unreliable transport between rural communities and urban markets/is);
    expect(SAMPLE_BRIEFING).toMatch(/seasonal flooding/is);
    expect(SAMPLE_BRIEFING).toMatch(/local delivery capacity is limited/is);
    expect(SAMPLE_BRIEFING).toMatch(/apprenticeship pilots.*local businesses/is);
    expect(SAMPLE_BRIEFING).toMatch(/maintaining existing routes.*building new ones/is);
    expect(SAMPLE_BRIEFING).toMatch(/drainage maintenance and early warnings/is);

    component.analyzeBriefing();
    expect(component.analysisStage).toBe('Analyzing briefing...');
    expect(component.isAnalyzing).toBe(true);

    await vi.advanceTimersByTimeAsync(analysisStepDelay);
    expect(component.analysisStage).toBe('Checking reference notes...');
    expect(component.currentStep).toBe(1);

    await vi.advanceTimersByTimeAsync(analysisStepDelay);

    expect(component.analysisStage).toBe('Analysis completed.');
    expect(component.isAnalyzing).toBe(false);
    expect(component.completedSteps.has(1)).toBe(true);
    expect(component.currentStep).toBe(2);
    expect(component.priorities.map(({ title }) => title)).toEqual([
      'Address youth unemployment through practical skills development',
      'Improve rural access through transport route maintenance',
      'Reduce seasonal flood disruption and infrastructure damage',
    ]);
    expect(component.liveMessage).toContain('Fixed demonstration priorities');
    expect(fetchMock).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('clearly labels the fixed priorities as a demo for arbitrary briefings', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;

    component.briefingText = 'A completely unrelated briefing about coastal tourism.';
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('does not analyze your briefing with AI');
    component.analyzeBriefing();
    await vi.advanceTimersByTimeAsync(analysisStepDelay);
    await vi.advanceTimersByTimeAsync(analysisStepDelay);
    fixture.detectChanges();

    expect(component.currentStep).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('not generated from your briefing');
    expect(component.priorities).toHaveLength(3);
    fixture.destroy();
  });

  it('cancels the simulated analysis and clears its pending timer', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.briefingText = 'Regional briefing';
    const baselineTimers = vi.getTimerCount();

    component.analyzeBriefing();
    expect(vi.getTimerCount()).toBe(baselineTimers + 1);
    await vi.advanceTimersByTimeAsync(analysisStepDelay);
    expect(component.analysisStage).toBe('Checking reference notes...');

    component.cancelAnalysis();
    expect(component.isAnalyzing).toBe(false);
    expect(component.briefingError).toContain('cancelled');
    expect(vi.getTimerCount()).toBe(baselineTimers);

    await vi.advanceTimersByTimeAsync(analysisStepDelay * 2);
    expect(component.currentStep).toBe(1);
    expect(component.priorities).toEqual([]);
    fixture.destroy();
  });

  it('clears the pending analysis timer when the briefing changes', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.setBriefing('First briefing');
    const baselineTimers = vi.getTimerCount();
    component.analyzeBriefing();
    expect(vi.getTimerCount()).toBe(baselineTimers + 1);

    component.setBriefing('Updated briefing');

    expect(component.isAnalyzing).toBe(false);
    expect(vi.getTimerCount()).toBe(baselineTimers);
    await vi.advanceTimersByTimeAsync(analysisStepDelay * 2);
    expect(component.currentStep).toBe(1);
    expect(component.priorities).toEqual([]);
    fixture.destroy();
  });

  it('invalidates approved priorities and generated output when the briefing changes', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.briefingText = 'Original briefing';
    component.completedSteps.add(1);
    component.currentStep = 2;
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];
    const baselineTimers = vi.getTimerCount();

    component.approvePriorities();
    expect(component.completedSteps.has(2)).toBe(true);
    component.setBriefing('Changed briefing');

    expect(component.briefingText).toBe('Changed briefing');
    expect(component.completedSteps.size).toBe(0);
    expect(component.currentStep).toBe(1);
    expect(component.priorities).toEqual([]);
    expect(component.isGenerating).toBe(false);
    expect(component.generationText).toBe('');
    expect(component.generationStatus).toBe('idle');
    expect(vi.getTimerCount()).toBe(baselineTimers);
    fixture.destroy();
  });

  it('clears the pending analysis timer when reset is used', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.briefingText = 'Regional briefing';
    const baselineTimers = vi.getTimerCount();
    component.analyzeBriefing();
    expect(vi.getTimerCount()).toBe(baselineTimers + 1);

    component.reset();

    expect(component.briefingText).toBe('');
    expect(component.isAnalyzing).toBe(false);
    expect(component.currentStep).toBe(1);
    expect(vi.getTimerCount()).toBe(baselineTimers);
    fixture.destroy();
  });

  it('clears the pending analysis timer when the component is destroyed', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const baselineTimers = vi.getTimerCount();
    fixture.componentInstance.briefingText = 'Regional briefing';
    fixture.componentInstance.analyzeBriefing();
    expect(vi.getTimerCount()).toBe(baselineTimers + 1);

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(baselineTimers);
  });

  it('supports editing, adding, deleting, and approving priorities', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.priorities = [{ id: 1, title: 'Original', description: 'Original description' }];

    component.editPriority(component.priorities[0]);
    component.editTitle = 'Updated';
    component.editDescription = 'Updated description';
    component.saveEdit();
    expect(component.priorities[0]).toMatchObject({
      title: 'Updated',
      description: 'Updated description',
    });

    component.addPriority();
    expect(component.priorities).toHaveLength(2);
    expect(component.editingId).toBe(2);
    component.cancelEdit();
    component.deletePriority(1);
    expect(component.priorities.map(({ id }) => id)).toEqual([2]);

    component.completedSteps.add(1);
    component.approvePriorities();
    expect(component.completedSteps.has(2)).toBe(true);
    expect(component.currentStep).toBe(3);
    component.goToStep(2);
    expect(component.currentStep).toBe(2);
    fixture.destroy();
  });

  it('validates priority titles and blocks approval while a priority is being edited', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.completedSteps.add(1);
    component.currentStep = 2;
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];

    component.editPriority(component.priorities[0]);
    component.editTitle = '   ';
    component.saveEdit();
    expect(component.editingId).toBe(1);
    expect(component.prioritiesError).toContain('title is required');

    component.approvePriorities();
    expect(component.completedSteps.has(2)).toBe(false);
    expect(component.currentStep).toBe(2);
    expect(component.prioritiesError).toContain('Save or cancel');
    component.goToStep(3);
    expect(component.currentStep).toBe(2);

    component.cancelEdit();
    expect(component.prioritiesError).toBe('');
    component.priorities[0].title = '';
    component.approvePriorities();
    expect(component.completedSteps.has(2)).toBe(false);
    expect(component.prioritiesError).toContain('Every priority must have a title');
    fixture.destroy();
  });

  it('invalidates approval and stops active generation when a saved priority changes', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.completedSteps.add(1);
    component.currentStep = 2;
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];

    const baselineTimers = vi.getTimerCount();
    component.approvePriorities();
    expect(component.isGenerating).toBe(true);
    expect(component.completedSteps.has(2)).toBe(true);
    component.goToStep(2);
    component.editPriority(component.priorities[0]);
    component.editTitle = 'Updated priority';
    component.saveEdit();

    expect(component.completedSteps.has(2)).toBe(false);
    expect(component.isGenerating).toBe(false);
    expect(component.generationText).toBe('');
    expect(component.generationStatus).toBe('idle');
    component.goToStep(3);
    expect(component.currentStep).toBe(2);
    expect(vi.getTimerCount()).toBe(baselineTimers);
    fixture.destroy();
  });

  it('invalidates approval when priorities are added or deleted', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.completedSteps.add(1);
    component.currentStep = 2;
    component.priorities = [
      { id: 1, title: 'First priority' },
      { id: 2, title: 'Second priority' },
    ];

    component.approvePriorities();
    component.goToStep(2);
    component.addPriority();
    expect(component.completedSteps.has(2)).toBe(false);
    expect(component.isGenerating).toBe(false);
    expect(component.priorities).toHaveLength(3);

    component.cancelEdit();
    component.approvePriorities();
    component.goToStep(2);
    component.deletePriority(1);
    expect(component.completedSteps.has(2)).toBe(false);
    expect(component.isGenerating).toBe(false);
    expect(component.priorities.map(({ id }) => id)).toEqual([2, 3]);
    fixture.destroy();
  });

  it('does not start a second generation operation before the active one finishes', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.completedSteps.add(1);
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];

    const baselineTimers = vi.getTimerCount();
    component.approvePriorities();
    expect(component.isGenerating).toBe(true);
    expect(vi.getTimerCount()).toBe(baselineTimers + 1);
    component.approvePriorities();

    expect(vi.getTimerCount()).toBe(baselineTimers + 1);
    expect(component.currentStep).toBe(3);
    fixture.destroy();
  });

  it('prevents approval with no priorities and allows deleting down to zero', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.completedSteps.add(1);

    component.approvePriorities();
    expect(component.currentStep).toBe(1);
    expect(component.completedSteps.has(2)).toBe(false);
    component.goToStep(3);
    expect(component.currentStep).toBe(1);

    component.priorities = [{ id: 1, title: 'Only priority' }];
    component.deletePriority(1);
    expect(component.priorities).toEqual([]);
    expect(component.prioritiesError).toContain('At least one priority');
    component.approvePriorities();
    expect(component.currentStep).toBe(1);
    fixture.destroy();
  });

  it('resets approved priorities and generated state for a new analysis', () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.briefingText = 'Regional briefing';
    component.completedSteps.add(1);
    component.currentStep = 2;
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];
    const baselineTimers = vi.getTimerCount();
    component.approvePriorities();

    expect(component.currentStep).toBe(3);
    expect(component.completedSteps.has(2)).toBe(true);
    component.reset();

    expect(component.briefingText).toBe('');
    expect(component.priorities).toEqual([]);
    expect(component.completedSteps.size).toBe(0);
    expect(component.currentStep).toBe(1);
    expect(component.isGenerating).toBe(false);
    expect(component.generationText).toBe('');
    expect(component.generationStatus).toBe('idle');
    expect(vi.getTimerCount()).toBe(baselineTimers);
    fixture.destroy();
  });

  it('displays mock JSON recommendations in Step 3 using approved briefing and priorities', async () => {
    vi.useFakeTimers();
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.briefingText = 'Solana regional briefing';
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];
    component.completedSteps.add(1);
    const generationService = TestBed.inject(GenerationService);
    const generateSpy = vi.spyOn(generationService, 'generate');

    component.approvePriorities();
    expect(component.currentStep).toBe(3);
    expect(component.isGenerating).toBe(true);
    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        briefing: 'Solana regional briefing',
        priorities: [{ id: 'priority-1', text: 'Reviewed priority' }],
        messages: [expect.objectContaining({ role: 'user' })],
      }),
    );
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.chip')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.chip')?.textContent).toContain('Reviewed priority');
    expect(fixture.nativeElement.textContent).toContain('Demonstration mode');

    await vi.advanceTimersByTimeAsync(5000);
    fixture.detectChanges();

    expect(component.isGenerating).toBe(false);
    expect(component.generationStatus).toBe('complete');
    expect(component.generationText).toContain('Reviewed priority');
    expect(fixture.nativeElement.querySelector('.generated-text')?.textContent).toContain('mock data');
    expect(fixture.nativeElement.textContent).not.toContain('Immediate Coastal Security Review');
    fixture.destroy();
  });

  it('shows service errors without mock fallback and retries through the same API', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.completedSteps.add(1);
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];
    const generationService = TestBed.inject(GenerationService);
    let attempts = 0;
    const generateSpy = vi.spyOn(generationService, 'generate').mockImplementation(
      () =>
        new Observable((subscriber) => {
          if (attempts++ === 0) {
            Promise.resolve().then(() => subscriber.error(new Error('Backend unavailable.')));
            return;
          }
          subscriber.next({ text: 'Recovered response.' });
          subscriber.complete();
        }),
    );

    component.approvePriorities();
    await vi.waitFor(() => expect(component.generationStatus).toBe('failed'));
    fixture.detectChanges();

    expect(component.generationText).toBe('');
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Backend unavailable.');
    expect(fixture.nativeElement.textContent).toContain('Retry generation');

    const retryButton = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.retry-generation');
    retryButton?.click();
    await vi.waitFor(() => expect(component.generationStatus).toBe('complete'));
    expect(generateSpy).toHaveBeenCalledTimes(2);
    expect(component.generationText).toBe('Recovered response.');
    fixture.destroy();
  });

  it('cancels the active generation by unsubscribing', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const component = fixture.componentInstance;
    component.completedSteps.add(1);
    component.priorities = [{ id: 1, title: 'Reviewed priority' }];
    const generationService = TestBed.inject(GenerationService);
    let cancelled = false;
    vi.spyOn(generationService, 'generate').mockReturnValue(
      new Observable(() => () => {
        cancelled = true;
      }),
    );

    component.approvePriorities();
    expect(component.isGenerating).toBe(true);
    component.cancelGeneration();

    expect(component.isGenerating).toBe(false);
    expect(component.generationStatus).toBe('cancelled');
    expect(cancelled).toBe(true);
    fixture.destroy();
  });
});
