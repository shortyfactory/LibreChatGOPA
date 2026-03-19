import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Globe2, Languages, LoaderCircle, X } from 'lucide-react';
import {
  deeplSupportedUploadExtensions,
  deeplSupportedUploadMimeTypes,
  deeplUploadAccept,
} from 'librechat-data-provider';
import type {
  DeepLDocumentStatusCode,
  DeepLStatusResponse,
  DeepLUploadResponse,
} from 'librechat-data-provider';
import type { FormEvent } from 'react';
import {
  useCheckDeepLDocumentStatusMutation,
  useDownloadDeepLDocumentMutation,
  useGetDeepLLanguagesQuery,
  useUploadDeepLDocumentMutation,
} from '~/data-provider';
import PageHeaderCard from '~/components/PageHeaderCard';
import { useLocalize } from '~/hooks';

const supportedUploadMimeTypes = new Set<string>(deeplSupportedUploadMimeTypes);
const supportedUploadExtensions = new Set<string>(deeplSupportedUploadExtensions);

const getFileExtension = (fileName: string): string => {
  const extensionIndex = fileName.lastIndexOf('.');
  return extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : '';
};

const isSupportedDeepLFile = (file: File): boolean => {
  const fileExtension = getFileExtension(file.name);
  if (supportedUploadExtensions.has(fileExtension)) {
    return true;
  }

  return file.type.length > 0 && supportedUploadMimeTypes.has(file.type.toLowerCase());
};

const formatSupportedFormats = (): string => {
  return deeplSupportedUploadExtensions
    .map((extension) => extension.replace('.', '').toUpperCase())
    .join(', ');
};

const getErrorMessage = (error: unknown, fallbackMessage: string): string => {
  const responseData = (error as { response?: { data?: { message?: string } } })?.response?.data;
  if (responseData?.message) {
    return responseData.message;
  }

  return error instanceof Error && error.message.trim().length > 0
    ? error.message
    : fallbackMessage;
};

const getStatusLabel = (
  localize: ReturnType<typeof useLocalize>,
  status: DeepLDocumentStatusCode,
): string => {
  switch (status) {
    case 'done':
      return localize('com_ui_gopa_deepl_status_done');
    case 'error':
      return localize('com_ui_gopa_deepl_status_error');
    case 'queued':
      return localize('com_ui_gopa_deepl_status_queued');
    case 'translating':
      return localize('com_ui_gopa_deepl_status_translating');
    case 'uploaded':
      return localize('com_ui_gopa_deepl_status_uploaded');
    default:
      return status;
  }
};

const parseDownloadFileName = (
  contentDisposition?: string,
  fallbackFileName = 'translated_document',
): string => {
  if (!contentDisposition) {
    return fallbackFileName;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return basicMatch?.[1] ?? fallbackFileName;
};

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-border-light bg-surface-secondary p-4">
      <div className="text-xs uppercase tracking-wide text-text-secondary">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-text-primary">{value}</div>
    </div>
  );
}

export default function DeeplTranslator() {
  const localize = useLocalize();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('');
  const [uploadResponse, setUploadResponse] = useState<DeepLUploadResponse | null>(null);
  const [statusResponse, setStatusResponse] = useState<DeepLStatusResponse | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const languagesQuery = useGetDeepLLanguagesQuery();
  const uploadMutation = useUploadDeepLDocumentMutation();
  const statusMutation = useCheckDeepLDocumentStatusMutation();
  const downloadMutation = useDownloadDeepLDocumentMutation();

  const supportedFormats = formatSupportedFormats();
  const sourceLanguages = languagesQuery.data?.sourceLanguages;
  const targetLanguages = languagesQuery.data?.targetLanguages;
  const currentStatus = statusResponse?.status ?? uploadResponse?.status ?? null;

  useEffect(() => {
    if (!sourceLanguages || sourceLanguages.length === 0) {
      return;
    }

    const hasCurrentSourceLanguage = sourceLanguages.some(
      (language) => language.code === sourceLanguage,
    );

    if (hasCurrentSourceLanguage) {
      return;
    }

    const defaultSourceLanguage =
      sourceLanguages.find((language) => language.code.toLowerCase() === 'en')?.code ??
      sourceLanguages[0]?.code ??
      '';

    setSourceLanguage(defaultSourceLanguage);
  }, [sourceLanguage, sourceLanguages]);

  useEffect(() => {
    if (!uploadResponse || statusResponse?.isError || statusResponse?.isReady) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (statusMutation.isLoading) {
        return;
      }

      statusMutation.mutate(uploadResponse, {
        onSuccess: (response) => {
          setStatusResponse(response);
        },
      });
    }, 2000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [statusMutation, statusResponse?.isError, statusResponse?.isReady, uploadResponse]);

  const activeErrorMessage =
    validationMessage ||
    (languagesQuery.isError
      ? getErrorMessage(languagesQuery.error, localize('com_ui_gopa_deepl_languages_failed'))
      : null) ||
    (uploadMutation.isError
      ? getErrorMessage(uploadMutation.error, localize('com_ui_gopa_deepl_request_failed'))
      : null) ||
    (statusMutation.isError
      ? getErrorMessage(statusMutation.error, localize('com_ui_gopa_deepl_status_failed'))
      : null) ||
    (downloadMutation.isError
      ? getErrorMessage(downloadMutation.error, localize('com_ui_gopa_deepl_download_failed'))
      : null) ||
    statusResponse?.errorMessage ||
    null;

  const handleClearFile = () => {
    setSelectedFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    handleClearFile();
    setTargetLanguage('');
    setUploadResponse(null);
    setStatusResponse(null);
    setValidationMessage(null);
    uploadMutation.reset();
    statusMutation.reset();
    downloadMutation.reset();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidationMessage(null);

    if (!selectedFile) {
      setValidationMessage(localize('com_ui_gopa_deepl_missing_file'));
      return;
    }

    if (!isSupportedDeepLFile(selectedFile)) {
      setValidationMessage(
        localize('com_ui_gopa_deepl_unsupported_file', { formats: supportedFormats }),
      );
      return;
    }

    if (!targetLanguage) {
      setValidationMessage(localize('com_ui_gopa_deepl_missing_target_language'));
      return;
    }

    if (sourceLanguage && targetLanguage === sourceLanguage) {
      setValidationMessage(localize('com_ui_gopa_deepl_matching_languages'));
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (sourceLanguage) {
      formData.append('sourceLanguage', sourceLanguage);
    }
    formData.append('targetLanguage', targetLanguage);

    uploadMutation.reset();
    statusMutation.reset();
    downloadMutation.reset();

    try {
      const response = await uploadMutation.mutateAsync(formData);
      setUploadResponse(response);
      setStatusResponse(null);
      handleClearFile();
    } catch {
      return;
    }
  };

  const handleDownload = async () => {
    if (!uploadResponse || !statusResponse?.isReady) {
      return;
    }

    try {
      const response = await downloadMutation.mutateAsync(uploadResponse);
      const blob = response.data;
      const contentDisposition = response.headers['content-disposition'];
      const fallbackFileName = uploadResponse.fileName || 'translated_document';
      const downloadFileName = parseDownloadFileName(contentDisposition, fallbackFileName);
      const downloadUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = downloadUrl;
      anchor.download = downloadFileName;
      anchor.click();

      window.URL.revokeObjectURL(downloadUrl);
      setUploadResponse(null);
      setStatusResponse(null);
      downloadMutation.reset();
    } catch {
      return;
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeaderCard
          iconSrc="/assets/ai_translator_icon.png"
          title={localize('com_ui_gopa_deepl_title')}
          description={localize('com_ui_gopa_deepl_description')}
        >
          <div className="relative hidden lg:block lg:w-[320px] xl:w-[360px]">
            <div className="absolute -inset-3 rounded-[30px] bg-gradient-to-br from-slate-200/35 via-transparent to-amber-100/30 blur-2xl" />
            <div className="relative overflow-hidden rounded-[28px] bg-transparent shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)]">
              <img
                src="/assets/AI_Translator_grey.png"
                alt={localize('com_ui_gopa_deepl_header_alt')}
                className="block aspect-[256/253] w-full object-cover object-center"
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
                  <label className="text-sm font-semibold">
                    {localize('com_ui_gopa_deepl_file_label')}
                  </label>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={deeplUploadAccept}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    setValidationMessage(null);
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
                        aria-label={localize('com_ui_gopa_deepl_clear_file')}
                      >
                        <X className="size-4" />
                      </button>
                    </>
                  ) : null}
                </div>

                <div className="mt-2 text-xs text-text-secondary">
                  {localize('com_ui_gopa_deepl_file_help', { formats: supportedFormats })}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-text-primary">
                    <Globe2 className="size-4 text-text-secondary" />
                    <label htmlFor="deepl-source-language" className="text-sm font-semibold">
                      {localize('com_ui_gopa_deepl_source_language')}
                    </label>
                  </div>

                  <select
                    id="deepl-source-language"
                    value={sourceLanguage}
                    onChange={(event) => setSourceLanguage(event.target.value)}
                    disabled={
                      languagesQuery.isLoading || !sourceLanguages || sourceLanguages.length === 0
                    }
                    className="h-10 w-full rounded-xl border border-border-light bg-transparent px-3 text-sm text-text-primary outline-none transition-colors focus:border-border-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {!sourceLanguages || sourceLanguages.length === 0 ? (
                      <option value="">{localize('com_ui_gopa_deepl_languages_loading')}</option>
                    ) : null}
                    {(sourceLanguages ?? []).map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.name} ({language.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-text-primary">
                    <Languages className="size-4 text-text-secondary" />
                    <label htmlFor="deepl-target-language" className="text-sm font-semibold">
                      {localize('com_ui_gopa_deepl_target_language')}
                    </label>
                  </div>

                  <select
                    id="deepl-target-language"
                    value={targetLanguage}
                    onChange={(event) => setTargetLanguage(event.target.value)}
                    disabled={
                      languagesQuery.isLoading || !targetLanguages || targetLanguages.length === 0
                    }
                    className="h-10 w-full rounded-xl border border-border-light bg-transparent px-3 text-sm text-text-primary outline-none transition-colors focus:border-border-medium disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <option value="">
                      {localize('com_ui_gopa_deepl_target_language_placeholder')}
                    </option>
                    {(targetLanguages ?? []).map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.name} ({language.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={
                    languagesQuery.isLoading ||
                    uploadMutation.isLoading ||
                    statusMutation.isLoading ||
                    downloadMutation.isLoading
                  }
                  className="rounded-xl bg-surface-tertiary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadMutation.isLoading
                    ? localize('com_ui_gopa_deepl_processing')
                    : localize('com_ui_gopa_deepl_submit')}
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={
                    uploadMutation.isLoading ||
                    statusMutation.isLoading ||
                    downloadMutation.isLoading
                  }
                  className="rounded-xl border border-border-light px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {localize('com_ui_clear')}
                </button>
              </div>
            </div>
          </form>

          <aside className="rounded-3xl border border-border-light bg-surface-secondary p-5">
            <div className="text-sm font-semibold text-text-primary">
              {localize('com_ui_gopa_deepl_ready_now_title')}
            </div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-text-secondary">
              <p>{localize('com_ui_gopa_deepl_ready_now_paragraph')}</p>
              <p>
                {localize('com_ui_gopa_deepl_ready_now_formats', { formats: supportedFormats })}
              </p>
              <p>{localize('com_ui_gopa_deepl_ready_now_polling')}</p>
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

        {uploadMutation.isLoading ? (
          <div className="flex items-center justify-center rounded-3xl border border-border-light bg-surface-secondary p-10">
            <div className="flex items-center gap-3 text-text-secondary">
              <LoaderCircle className="size-6 animate-spin" />
              <span>{localize('com_ui_gopa_deepl_processing')}</span>
            </div>
          </div>
        ) : null}

        {uploadResponse ? (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label={localize('com_ui_gopa_deepl_uploaded_file')}
                value={uploadResponse.fileName}
              />
              <SummaryCard
                label={localize('com_ui_gopa_deepl_source_language')}
                value={uploadResponse.sourceLanguage ?? '-'}
              />
              <SummaryCard
                label={localize('com_ui_gopa_deepl_target_language')}
                value={uploadResponse.targetLanguage}
              />
              <SummaryCard
                label={localize('com_ui_gopa_deepl_current_status')}
                value={currentStatus ? getStatusLabel(localize, currentStatus) : '-'}
              />
            </div>

            <div className="rounded-3xl border border-border-light bg-surface-secondary p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {localize('com_ui_gopa_deepl_status_panel_title')}
                  </h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    {statusResponse?.isReady
                      ? localize('com_ui_gopa_deepl_download_ready')
                      : localize('com_ui_gopa_deepl_status_polling')}
                  </p>
                </div>

                {statusResponse?.isReady ? (
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={downloadMutation.isLoading}
                    className="inline-flex items-center gap-2 rounded-xl bg-surface-tertiary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download className="size-4" />
                    {downloadMutation.isLoading
                      ? localize('com_ui_gopa_deepl_download_loading')
                      : localize('com_ui_gopa_deepl_download')}
                  </button>
                ) : null}
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
                  <div className="text-xs uppercase tracking-wide text-text-secondary">
                    {localize('com_ui_gopa_deepl_status_document')}
                  </div>
                  <div className="mt-2 font-medium text-text-primary">
                    {uploadResponse.fileName}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
                  <div className="text-xs uppercase tracking-wide text-text-secondary">
                    {localize('com_ui_gopa_deepl_current_status')}
                  </div>
                  <div className="mt-2 font-medium text-text-primary">
                    {currentStatus ? getStatusLabel(localize, currentStatus) : '-'}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
                  <div className="text-xs uppercase tracking-wide text-text-secondary">
                    {localize('com_ui_gopa_deepl_seconds_remaining')}
                  </div>
                  <div className="mt-2 font-medium text-text-primary">
                    {statusResponse?.secondsRemaining ?? '-'}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
                  <div className="text-xs uppercase tracking-wide text-text-secondary">
                    {localize('com_ui_gopa_deepl_billed_characters')}
                  </div>
                  <div className="mt-2 font-medium text-text-primary">
                    {statusResponse?.billedCharacters ?? '-'}
                  </div>
                </div>

                <div className="rounded-2xl border border-border-light bg-surface-primary p-4">
                  <div className="text-xs uppercase tracking-wide text-text-secondary">
                    {localize('com_ui_gopa_deepl_download_help_title')}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">
                    {statusResponse?.isReady
                      ? localize('com_ui_gopa_deepl_download_help_ready')
                      : localize('com_ui_gopa_deepl_download_help_waiting')}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
