import { Fragment, useRef, useState } from 'react';
import { FileText, Globe2, LoaderCircle, Upload, X } from 'lucide-react';
import {
  sdgUploadAccept,
  sdgSourceLanguages,
  sdgSupportedUploadExtensions,
} from 'librechat-data-provider';
import type { SDGMappingNode, SDGMapResponse } from 'librechat-data-provider';
import type { FormEvent } from 'react';
import { getSDGNodeTitle } from '~/components/SDG/sdgMetadata';
import SidebarReopenButton from '~/components/Nav/SidebarReopenButton';
import PageHeaderCard from '~/components/PageHeaderCard';
import { useMapSDGMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';

const getErrorMessage = (error: unknown, fallback: string) => {
  const responseMessage = (error as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
  if (responseMessage) {
    return responseMessage;
  }

  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
};

const parseRelevance = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }

  const normalizedValue = value.replace('%', '').trim();
  const parsedValue = Number.parseFloat(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
};

const getSourceTypeLabel = (
  localize: ReturnType<typeof useLocalize>,
  sourceType: SDGMapResponse['sourceType'],
) => {
  return sourceType === 'file'
    ? localize('com_ui_gopa_sdg_source_type_file')
    : localize('com_ui_gopa_sdg_source_type_text');
};

const formatSupportedFormats = () => {
  return sdgSupportedUploadExtensions
    .map((extension) => extension.replace('.', '').toUpperCase())
    .join(', ');
};

type SDGResultNode = SDGMappingNode & {
  title: string | null;
  children: SDGResultNode[];
};

const enrichSDGNode = (node: SDGMappingNode): SDGResultNode => {
  return {
    ...node,
    title: getSDGNodeTitle(node.name),
    children: node.children.map(enrichSDGNode),
  };
};

const enrichSDGNodes = (nodes: SDGMappingNode[]): SDGResultNode[] => {
  return nodes.map(enrichSDGNode);
};

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border-light bg-surface-secondary p-4">
      <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{value}</div>
    </div>
  );
}

function ChildrenTable({
  localize,
  nodes,
}: {
  localize: ReturnType<typeof useLocalize>;
  nodes: SDGResultNode[];
}) {
  if (nodes.length === 0) {
    return (
      <span className="text-sm text-text-secondary">{localize('com_ui_gopa_sdg_no_targets')}</span>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-surface-primary">
      <table className="w-full border-collapse text-sm">
        <thead className="bg-surface-tertiary text-left">
          <tr>
            <th className="px-3 py-2 font-medium text-text-primary">{localize('com_ui_name')}</th>
            <th className="px-3 py-2 font-medium text-text-primary">{localize('com_ui_title')}</th>
            <th className="px-3 py-2 text-right font-medium text-text-primary">
              {localize('com_ui_gopa_sdg_occurrences')}
            </th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <Fragment key={`${node.id ?? node.name}-${node.occurrences}`}>
              <tr className="border-t border-border-light align-top">
                <td className="px-3 py-3 font-medium text-text-primary">{node.name}</td>
                <td className="px-3 py-3 text-sm leading-6 text-text-secondary">
                  {node.title ?? '-'}
                </td>
                <td className="px-3 py-3 text-right text-text-secondary">{node.occurrences}</td>
              </tr>
              {node.children.length > 0 ? (
                <tr className="bg-surface-secondary/40 border-t border-border-light">
                  <td colSpan={3} className="px-3 py-3">
                    <ChildrenTable localize={localize} nodes={node.children} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SDGMapper() {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [inputText, setInputText] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const sdgMutation = useMapSDGMutation();

  const supportedFormats = formatSupportedFormats();
  let activeErrorMessage: string | null = validationMessage;
  if (!activeErrorMessage && sdgMutation.isError) {
    activeErrorMessage = getErrorMessage(
      sdgMutation.error,
      localize('com_ui_gopa_sdg_request_failed'),
    );
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationMessage(null);

    const normalizedInputText = inputText.trim();
    if (!selectedFile && normalizedInputText.length === 0) {
      setValidationMessage(localize('com_ui_gopa_sdg_missing_input'));
      return;
    }

    sdgMutation.reset();

    const formData = new FormData();
    formData.append('sourceLanguage', sourceLanguage);

    if (normalizedInputText.length > 0) {
      formData.append('inputText', normalizedInputText);
    }

    if (selectedFile) {
      formData.append('file', selectedFile);
    }

    try {
      await sdgMutation.mutateAsync(formData);
    } catch {
      return;
    }
  };

  const handleReset = () => {
    setInputText('');
    setSourceLanguage('en');
    setSelectedFile(null);
    setValidationMessage(null);
    sdgMutation.reset();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const response = sdgMutation.data;
  const enrichedGoals = response ? enrichSDGNodes(response.goals) : [];

  return (
    <div className="h-full overflow-auto p-6">
      <SidebarReopenButton />
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeaderCard
          iconSrc="/assets/sdg_32.png"
          title={localize('com_ui_gopa_sdg_title')}
          description={localize('com_ui_gopa_sdg_description')}
        >
          <div className="relative hidden lg:block lg:w-[430px] xl:w-[500px]">
            <div className="absolute -inset-3 rounded-[30px] bg-gradient-to-br from-emerald-100/35 via-transparent to-amber-100/35 blur-2xl" />
            <div className="relative overflow-hidden rounded-[28px] bg-transparent shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
              <img
                src="/assets/sdg_goals.png"
                alt={localize('com_ui_gopa_sdg_goals_alt')}
                className="block aspect-[600/371] w-full object-cover object-center"
              />
            </div>
          </div>
        </PageHeaderCard>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-border-light bg-surface-secondary p-5"
          >
            <div className="grid gap-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-text-primary">
                  <FileText className="size-4 text-text-secondary" />
                  <label htmlFor="sdg-input-text" className="text-sm font-semibold">
                    {localize('com_ui_gopa_sdg_input_label')}
                  </label>
                </div>
                <textarea
                  id="sdg-input-text"
                  rows={10}
                  value={inputText}
                  onChange={(event) => setInputText(event.target.value)}
                  placeholder={localize('com_ui_gopa_sdg_input_placeholder')}
                  className="w-full rounded-2xl border border-border-light bg-transparent px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary focus:border-border-medium"
                />
                <div className="mt-2 text-xs text-text-secondary">
                  {localize('com_ui_gopa_sdg_text_help')}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-text-primary">
                    <Upload className="size-4 text-text-secondary" />
                    <label className="text-sm font-semibold">
                      {localize('com_ui_gopa_sdg_file_label')}
                    </label>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={sdgUploadAccept}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setSelectedFile(file);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-xl border border-border-light bg-surface-primary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover"
                    >
                      {localize('com_ui_upload')}
                    </button>
                    {selectedFile ? (
                      <>
                        <span className="rounded-full bg-surface-hover px-3 py-1 text-sm text-text-secondary">
                          {selectedFile.name}
                        </span>
                        <button
                          type="button"
                          onClick={handleClearFile}
                          className="rounded-full border border-border-light p-2 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                          aria-label={localize('com_ui_gopa_sdg_clear_file')}
                        >
                          <X className="size-4" />
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-text-secondary">
                    {localize('com_ui_gopa_sdg_file_help', { formats: supportedFormats })}
                  </div>
                  <div className="mt-1 text-xs text-text-secondary">
                    {localize('com_ui_gopa_sdg_file_priority')}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-text-primary">
                    <Globe2 className="size-4 text-text-secondary" />
                    <label htmlFor="sdg-source-language" className="text-sm font-semibold">
                      {localize('com_ui_gopa_sdg_source_language_label')}
                    </label>
                  </div>
                  <select
                    id="sdg-source-language"
                    value={sourceLanguage}
                    onChange={(event) => setSourceLanguage(event.target.value)}
                    className="h-10 w-full rounded-xl border border-border-light bg-transparent px-3 text-sm text-text-primary outline-none transition-colors focus:border-border-medium"
                  >
                    {sdgSourceLanguages.map((languageCode) => (
                      <option key={languageCode} value={languageCode}>
                        {languageCode.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 text-xs text-text-secondary">
                    {localize('com_ui_gopa_sdg_source_language_help')}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={sdgMutation.isLoading}
                  className="rounded-xl bg-surface-tertiary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sdgMutation.isLoading
                    ? localize('com_ui_gopa_sdg_processing')
                    : localize('com_ui_gopa_sdg_submit')}
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={sdgMutation.isLoading}
                  className="rounded-xl border border-border-light px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {localize('com_ui_clear')}
                </button>
              </div>
            </div>
          </form>

          <aside className="rounded-3xl border border-border-light bg-surface-secondary p-5">
            <div className="text-sm font-semibold text-text-primary">
              {localize('com_ui_gopa_sdg_ready_now_title')}
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
              <p>{localize('com_ui_gopa_sdg_ready_now_paragraph')}</p>
              <p>{localize('com_ui_gopa_sdg_server_parsing')}</p>
              <p>{localize('com_ui_gopa_sdg_supported_formats', { formats: supportedFormats })}</p>
            </div>
          </aside>
        </section>

        {activeErrorMessage ? (
          <div
            role="alert"
            className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
          >
            {activeErrorMessage}
          </div>
        ) : null}

        {sdgMutation.isLoading ? (
          <div className="flex items-center justify-center rounded-3xl border border-border-light bg-surface-secondary p-10">
            <div className="flex items-center gap-3 text-text-secondary">
              <LoaderCircle className="size-6 animate-spin" />
              <span>{localize('com_ui_gopa_sdg_processing')}</span>
            </div>
          </div>
        ) : null}

        {response ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                label={localize('com_ui_gopa_sdg_detected_goals')}
                value={response.totalGoals}
              />
              <SummaryCard
                label={localize('com_ui_gopa_sdg_detected_targets')}
                value={response.totalTargets}
              />
              <SummaryCard
                label={localize('com_ui_gopa_sdg_occurrences')}
                value={response.totalOccurrences}
              />
              <SummaryCard
                label={localize('com_ui_gopa_sdg_source_type')}
                value={getSourceTypeLabel(localize, response.sourceType)}
              />
              <SummaryCard
                label={localize('com_ui_gopa_sdg_source_language')}
                value={response.sourceLanguage.toUpperCase()}
              />
            </div>

            <div className="rounded-3xl border border-border-light bg-surface-secondary p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {localize('com_ui_gopa_sdg_results_title')}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {response.fileName
                      ? localize('com_ui_gopa_sdg_results_file', {
                          file: response.fileName,
                          language: response.sourceLanguage.toUpperCase(),
                        })
                      : localize('com_ui_gopa_sdg_results_text', {
                          count: response.textLength,
                          language: response.sourceLanguage.toUpperCase(),
                        })}
                  </p>
                </div>
                {response.fileMimeType ? (
                  <span className="rounded-full bg-surface-hover px-3 py-1 text-xs uppercase tracking-wide text-text-secondary">
                    {response.fileMimeType}
                  </span>
                ) : null}
              </div>

              {enrichedGoals.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-border-light bg-surface-primary p-4 text-sm text-text-secondary">
                  {response.message ?? localize('com_ui_gopa_sdg_no_results')}
                </div>
              ) : (
                <div className="mt-4 overflow-hidden rounded-2xl border border-border-light">
                  <table className="w-full border-collapse text-sm">
                    <thead className="bg-surface-tertiary text-left">
                      <tr>
                        <th className="px-4 py-3 font-medium text-text-primary">
                          {localize('com_ui_gopa_sdg_goal_name')}
                        </th>
                        <th className="px-4 py-3 font-medium text-text-primary">
                          {localize('com_ui_title')}
                        </th>
                        <th className="px-4 py-3 font-medium text-text-primary">
                          {localize('com_ui_gopa_sdg_occurrences')}
                        </th>
                        <th className="px-4 py-3 font-medium text-text-primary">
                          {localize('com_ui_gopa_sdg_relevance')}
                        </th>
                        <th className="px-4 py-3 font-medium text-text-primary">
                          {localize('com_ui_gopa_sdg_children')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {enrichedGoals.map((goal) => {
                        const relevanceValue = parseRelevance(goal.relevance);

                        return (
                          <tr
                            key={`${goal.id ?? goal.name}-${goal.occurrences}`}
                            className="border-t border-border-light align-top"
                          >
                            <td className="px-4 py-4 text-text-primary">
                              <div className="font-medium">{goal.name}</div>
                            </td>
                            <td className="px-4 py-4 text-sm leading-6 text-text-secondary">
                              {goal.title ?? '-'}
                            </td>
                            <td className="px-4 py-4 text-text-secondary">{goal.occurrences}</td>
                            <td className="px-4 py-4 text-text-secondary">
                              {relevanceValue != null ? (
                                <div className="max-w-[180px] space-y-2">
                                  <div>{goal.relevance}</div>
                                  <div className="h-2 rounded-full bg-surface-hover">
                                    <div
                                      className="h-2 rounded-full bg-surface-tertiary"
                                      style={{
                                        width: `${Math.min(Math.max(relevanceValue, 0), 100)}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                (goal.relevance ?? '-')
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <ChildrenTable localize={localize} nodes={goal.children} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
