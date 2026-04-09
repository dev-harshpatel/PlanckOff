'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Bot, RefreshCw, Save, WandSparkles } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, useToast } from '@/components/ui';

type PromptTab = 'pdfExtractionPrompt' | 'materialMatchPrompt';

interface PromptPayload {
  pdfExtractionPrompt: string;
  materialMatchPrompt: string;
}

const TAB_CONFIG: Array<{
  id: PromptTab;
  title: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: 'pdfExtractionPrompt',
    title: 'PDF Extraction Prompt',
    shortLabel: 'PDF Extraction',
    description: 'Used when the pipeline reads the uploaded PDF and extracts assembly data.',
  },
  {
    id: 'materialMatchPrompt',
    title: 'Material Match Prompt',
    shortLabel: 'Material Match',
    description: 'Used when the pipeline maps extracted materials to your database entries.',
  },
];

const EMPTY_PROMPTS: PromptPayload = {
  pdfExtractionPrompt: '',
  materialMatchPrompt: '',
};

export function PromptManagementCard() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<PromptTab>('pdfExtractionPrompt');
  const [prompts, setPrompts] = useState<PromptPayload>(EMPTY_PROMPTS);
  const [savedPrompts, setSavedPrompts] = useState<PromptPayload>(EMPTY_PROMPTS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeConfig = useMemo(
    () => TAB_CONFIG.find((tab) => tab.id === activeTab) ?? TAB_CONFIG[0],
    [activeTab],
  );
  const isDirty = prompts[activeTab] !== savedPrompts[activeTab];

  const loadPrompts = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/ai-prompts', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load prompts');
      }

      const nextPrompts: PromptPayload = {
        pdfExtractionPrompt: data.pdfExtractionPrompt ?? '',
        materialMatchPrompt: data.materialMatchPrompt ?? '',
      };

      setPrompts(nextPrompts);
      setSavedPrompts(nextPrompts);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load prompts';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPrompts();
  }, []);

  const handleChange = (value: string) => {
    setPrompts((prev) => ({
      ...prev,
      [activeTab]: value,
    }));
  };

  const handleReset = () => {
    setPrompts((prev) => ({
      ...prev,
      [activeTab]: savedPrompts[activeTab],
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);

      const response = await fetch('/api/ai-prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [activeTab]: prompts[activeTab],
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save prompt');
      }

      const nextPrompts: PromptPayload = {
        pdfExtractionPrompt: data.pdfExtractionPrompt ?? '',
        materialMatchPrompt: data.materialMatchPrompt ?? '',
      };

      setPrompts(nextPrompts);
      setSavedPrompts(nextPrompts);
      toast.success('Prompt Saved', `${activeConfig.shortLabel} prompt is now live for the pipeline.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save prompt';
      setError(message);
      toast.error('Save Failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-sm overflow-hidden" padding="none">
      <CardHeader className="mb-0 border-b border-slate-200 bg-gradient-to-r from-sky-50 via-white to-emerald-50 px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              <Bot className="h-3.5 w-3.5" />
              AI Prompt Management
            </div>
            <CardTitle className="mt-3">Pipeline Prompts</CardTitle>
            <CardDescription className="max-w-3xl">
              Edit the global prompts used by the PDF extraction and material matching steps. Saved changes are pulled from the database and used automatically on the next pipeline run.
            </CardDescription>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-white/90 px-4 py-3 text-sm text-slate-600 shadow-sm">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <WandSparkles className="h-4 w-4 text-emerald-600" />
              Server-backed prompts
            </div>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              If a prompt is missing in the database, the server falls back to the existing file prompt and backfills it automatically.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2">
            {TAB_CONFIG.map((tab) => {
              const isActive = activeTab === tab.id;
              const tabDirty = prompts[tab.id] !== savedPrompts[tab.id];

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition-all ${
                    isActive
                      ? 'border-sky-300 bg-sky-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{tab.shortLabel}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{tab.description}</p>
                    </div>
                    {tabDirty && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                        Unsaved
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{activeConfig.title}</h3>
                <p className="mt-1 text-sm text-slate-500">{activeConfig.description}</p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  onClick={handleReset}
                  disabled={!isDirty || isLoading || isSaving}
                >
                  Reset
                </Button>
                <Button
                  type="button"
                  variant="success"
                  size="sm"
                  icon={Save}
                  onClick={handleSave}
                  isLoading={isSaving}
                  disabled={isLoading || !isDirty}
                >
                  Save Prompt
                </Button>
              </div>
            </div>

            {error && (
              <div className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <div className="flex items-center justify-between gap-3">
                  <span>{error}</span>
                  <button
                    type="button"
                    onClick={() => void loadPrompts()}
                    className="font-semibold text-red-800 underline underline-offset-4 hover:no-underline"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}

            <div className="p-5">
              {isLoading ? (
                <div className="space-y-3">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="h-[360px] animate-pulse rounded-2xl bg-slate-100" />
                </div>
              ) : (
                <>
                  <textarea
                    value={prompts[activeTab]}
                    onChange={(event) => handleChange(event.target.value)}
                    spellCheck={false}
                    className="min-h-[360px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-[13px] leading-6 text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-100"
                    placeholder={`Enter the ${activeConfig.shortLabel.toLowerCase()} prompt...`}
                  />

                  <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                    <p>
                      {isDirty
                        ? 'You have unsaved changes in this prompt.'
                        : 'This prompt matches the latest saved value in the database.'}
                    </p>
                    <p className="font-medium text-slate-400">
                      {prompts[activeTab].length.toLocaleString()} characters
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
