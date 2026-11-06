import { ChangeDetectorRef, Component, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MAX_BRIEFING_LENGTH } from '../../shared/api-contract';
import { Subscription } from 'rxjs';
import { GenerationService, type GenerationRequest } from './generation/generation.service';

export interface Priority {
  id: number;
  title: string;
  description?: string;
  label?: string;
}

const MOCK_ANALYSIS_STEP_DELAY_MS = 700;

const DEMONSTRATION_PRIORITIES: readonly Omit<Priority, 'id'>[] = [
  {
    title: 'Address youth unemployment through practical skills development',
    description:
      'Explore apprenticeship pilots that connect young people with local businesses and address reported employer skills gaps.',
  },
  {
    title: 'Improve rural access through transport route maintenance',
    description:
      'Prioritize maintaining existing transport routes to preserve access to urban markets and essential services, rather than relying on costly new construction.',
  },
  {
    title: 'Reduce seasonal flood disruption and infrastructure damage',
    description:
      'Consider drainage maintenance and early-warning measures that are realistic within the limited capacity and funding of local authorities.',
  },
];


export const SAMPLE_BRIEFING = `Solana is a fictional coastal region with high youth unemployment, unreliable transport between rural communities and urban markets, and increasing seasonal flooding. Local authorities have limited funding and need three practical priorities for the next two years.
Employers report skills gaps. Small apprenticeship pilots could connect young people with local businesses.
Seasonal road closures delay access to markets. Maintaining existing routes may be more feasible than building new ones.
Drainage maintenance and early warnings could reduce disruption. Local delivery capacity is limited.`;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatIconModule,
    MatTooltipModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class AppComponent implements OnDestroy {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  readonly generationService = inject(GenerationService);
  private analysisTimer?: ReturnType<typeof setTimeout>;
  private generationSubscription?: Subscription;

  currentStep: 1 | 2 | 3 = 1;
  completedSteps = new Set<number>();

  // Step 1 state
  briefingText = '';
  briefingError = '';
  readonly maxBriefingLength = MAX_BRIEFING_LENGTH;
  isAnalyzing = false;
  analysisStage = '';

  // Step 2 state
  priorities: Priority[] = [];
  editingId: number | null = null;
  editTitle = '';
  editDescription = '';
  prioritiesError = '';
  liveMessage = '';

  // Step 3 state
  isGenerating = false;
  generationText = '';
  generationStatus: 'idle' | 'generating' | 'complete' | 'failed' | 'cancelled' = 'idle';
  generationError = '';

  ngOnDestroy(): void {
    this.clearAnalysisTimer();
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = undefined;
  }

  // --- Step 1 ---
  loadSample(): void {
    this.setBriefing(SAMPLE_BRIEFING);
    this.liveMessage = 'Sample briefing loaded for Solana';
  }

  setBriefing(value: string): void {
    if (value !== this.briefingText) {
      this.briefingText = value;
      this.invalidateAnalysisResults();
    }
  }

  analyzeBriefing(): void {
    const briefing = this.briefingText.trim();
    if (!briefing) {
      this.briefingError = 'Briefing text is required to proceed.';
      return;
    }
    if (briefing.length > MAX_BRIEFING_LENGTH) {
      this.briefingError = `Briefing text must be ${MAX_BRIEFING_LENGTH} characters or fewer.`;
      return;
    }

    this.clearAnalysisResults();
    this.briefingError = '';
    this.isAnalyzing = true;
    this.analysisStage = 'Analyzing briefing...';
    this.liveMessage = 'Analyzing briefing';

    this.analysisTimer = setTimeout(() => {
      this.analysisStage = 'Checking reference notes...';
      this.liveMessage = 'Checking reference notes';
      this.changeDetectorRef.markForCheck();

      this.analysisTimer = setTimeout(() => {
        this.analysisTimer = undefined;
        this.isAnalyzing = false;
        this.analysisStage = 'Analysis completed.';
        this.priorities = DEMONSTRATION_PRIORITIES.map((priority, index) => ({
          ...priority,
          id: index + 1,
        }));
        this.completedSteps.add(1);
        this.currentStep = 2;
        this.liveMessage = 'Demonstration analysis complete. Fixed demonstration priorities are ready to review';
        this.changeDetectorRef.markForCheck();
      }, MOCK_ANALYSIS_STEP_DELAY_MS);
    }, MOCK_ANALYSIS_STEP_DELAY_MS);
  }

  cancelAnalysis(): void {
    if (!this.isAnalyzing) return;
    this.clearAnalysisTimer();
    this.isAnalyzing = false;
    this.analysisStage = 'Analysis cancelled.';
    this.briefingError = 'Analysis was cancelled. You can try again.';
    this.liveMessage = 'Analysis cancelled';
    this.changeDetectorRef.markForCheck();
  }

  // --- Step 2 ---
  editPriority(p: Priority): void {
    this.editingId = p.id;
    this.editTitle = p.title;
    this.editDescription = p.description ?? '';
  }

  saveEdit(): void {
    if (this.editingId === null) return;
    const title = this.editTitle.trim();
    if (!title) {
      this.prioritiesError = 'Priority title is required.';
      return;
    }

    const target = this.priorities.find(p => p.id === this.editingId);
    if (target) {
      const description = this.editDescription.trim();
      const changed = target.title !== title || (target.description ?? '') !== description;
      target.title = title;
      target.description = description;
      this.liveMessage = `Priority ${target.id} updated`;
      this.prioritiesError = '';
      if (changed) this.invalidatePriorityApproval();
    }
    this.editingId = null;
  }

  cancelEdit(): void {
    this.editingId = null;
    this.prioritiesError = '';
  }

  deletePriority(id: number): void {
    const previousLength = this.priorities.length;
    this.priorities = this.priorities.filter(p => p.id !== id);
    if (this.priorities.length === previousLength) return;
    this.invalidatePriorityApproval();
    this.liveMessage = `Priority ${id} deleted`;
    if (this.priorities.length === 0) {
      this.prioritiesError = 'At least one priority is required to generate recommendations.';
    } else {
      this.prioritiesError = '';
    }
  }

  addPriority(): void {
    const newId = Math.max(0, ...this.priorities.map(p => p.id)) + 1;
    this.priorities.push({
      id: newId,
      title: 'New priority',
      description: 'Describe the priority objective here.'
    });
    this.invalidatePriorityApproval();
    this.prioritiesError = '';
    this.editPriority(this.priorities[this.priorities.length - 1]);
    this.liveMessage = `Priority ${newId} added`;
  }

  approvePriorities(): void {
    if (this.isAnalyzing || this.isGenerating) return;
    if (!this.completedSteps.has(1)) {
      this.prioritiesError = 'Complete the briefing demonstration before approving priorities.';
      return;
    }
    if (this.editingId !== null) {
      this.prioritiesError = 'Save or cancel the priority edit before approving.';
      return;
    }
    if (this.priorities.length === 0) {
      this.prioritiesError = 'At least one priority is required to generate recommendations.';
      return;
    }
    if (this.priorities.some(priority => !priority.title.trim())) {
      this.prioritiesError = 'Every priority must have a title.';
      return;
    }
    this.prioritiesError = '';
    this.completedSteps.add(2);
    this.currentStep = 3;
    this.startGeneration();
  }

  // --- Step 3 ---
  startGeneration(): void {
    if (this.isAnalyzing || this.isGenerating || !this.completedSteps.has(2) || this.editingId !== null) return;
    const request: GenerationRequest = {
      briefing: this.briefingText.trim(),
      priorities: this.priorities.map((priority) => ({
        id: `priority-${priority.id}`,
        text: priority.description ? `${priority.title}: ${priority.description}` : priority.title,
      })),
      messages: [
        {
          role: 'user',
          content:
            'Generate practical, evidence-aware recommendations for the approved priorities. Keep actions proportionate to local funding and delivery capacity.',
        },
      ],
    };

    this.isGenerating = true;
    this.generationStatus = 'generating';
    this.generationError = '';
    this.generationText = '';
    this.liveMessage = this.generationService.mode === 'mock'
      ? 'Generating demonstration recommendations'
      : 'Generating recommendations';
    this.generationSubscription = this.generationService.generate(request).subscribe({
      next: (response) => {
        this.isGenerating = false;
        this.generationSubscription = undefined;
        if (!response.text.trim()) {
          this.generationError = 'The generation service returned an empty response.';
          this.generationStatus = 'failed';
          this.liveMessage = 'Recommendation generation failed';
        } else {
          this.generationText = response.text;
          this.generationStatus = 'complete';
          this.liveMessage = 'Recommendations generated';
        }
        this.changeDetectorRef.markForCheck();
      },
      error: (error: unknown) => {
        this.generationError = this.getGenerationErrorMessage(error);
        this.generationStatus = 'failed';
        this.isGenerating = false;
        this.generationSubscription = undefined;
        this.liveMessage = 'Recommendation generation failed';
        this.changeDetectorRef.markForCheck();
      },
      complete: () => {
        this.isGenerating = false;
        this.generationSubscription = undefined;
        this.changeDetectorRef.markForCheck();
      },
    });
  }

  cancelGeneration(): void {
    if (!this.isGenerating) return;
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = undefined;
    this.isGenerating = false;
    this.generationStatus = 'cancelled';
    this.generationError = '';
    this.liveMessage = 'Generation cancelled';
    this.changeDetectorRef.markForCheck();
  }

  private getGenerationErrorMessage(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'error' in error) {
      const body = error.error;
      if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
        return body.message;
      }
    }
    if (error instanceof Error && error.message) return error.message;
    return 'Recommendations could not be generated. Try again.';
  }

  goToStep(step: 1 | 2 | 3): void {
    if (this.isGenerating && step !== this.currentStep) this.cancelGeneration();
    if (step === 1 || (step === 2 && this.completedSteps.has(1)) ||
      (step === 3 && this.completedSteps.has(2) && this.editingId === null &&
        this.priorities.length > 0 && this.priorities.every(priority => !!priority.title.trim()))) {
      this.currentStep = step;
    }
  }

  reset(): void {
    this.briefingText = '';
    this.clearAnalysisResults();
    this.currentStep = 1;
    this.completedSteps.clear();
    this.liveMessage = '';
    this.changeDetectorRef.markForCheck();
  }

  private clearAnalysisTimer(): void {
    if (this.analysisTimer !== undefined) {
      clearTimeout(this.analysisTimer);
      this.analysisTimer = undefined;
    }
  }

  private invalidateAnalysisResults(): void {
    this.clearAnalysisResults();
    this.currentStep = 1;
    this.completedSteps.clear();
    this.changeDetectorRef.markForCheck();
  }

  private invalidatePriorityApproval(): void {
    if (!this.completedSteps.delete(2)) return;
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = undefined;
    this.isGenerating = false;
    this.generationStatus = 'idle';
    this.generationError = '';
    this.generationText = '';
  }

  private clearAnalysisResults(): void {
    this.clearAnalysisTimer();
    this.isAnalyzing = false;
    this.analysisStage = '';
    this.briefingError = '';
    this.prioritiesError = '';
    this.priorities = [];
    this.editingId = null;
    this.editTitle = '';
    this.editDescription = '';
    this.generationSubscription?.unsubscribe();
    this.generationSubscription = undefined;
    this.isGenerating = false;
    this.generationStatus = 'idle';
    this.generationError = '';
    this.generationText = '';
    this.liveMessage = '';
    this.currentStep = 1;
    this.completedSteps.clear();
  }

}