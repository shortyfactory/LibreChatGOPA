/**
 * Obtains the date string in 'YYYY-MM-DD' format.
 *
 * @param {string} [clientTimestamp] - Optional ISO timestamp string. If provided, uses this timestamp;
 * otherwise, uses the current date.
 * @returns {string} - The date string in 'YYYY-MM-DD' format.
 */
function getDateStr(clientTimestamp) {
  return clientTimestamp ? clientTimestamp.split('T')[0] : new Date().toISOString().split('T')[0];
}

/**
 * Obtains the time string in 'HH:MM:SS' format.
 *
 * @param {string} [clientTimestamp] - Optional ISO timestamp string. If provided, uses this timestamp;
 * otherwise, uses the current time.
 * @returns {string} - The time string in 'HH:MM:SS' format.
 */
function getTimeStr(clientTimestamp) {
  return clientTimestamp
    ? clientTimestamp.split('T')[1].split('.')[0]
    : new Date().toTimeString().split(' ')[0];
}

const assistantExecutionInstructions = `
When the user's request about attached files, knowledge files, retrieved documents, or code interpreter files is clear, do the work immediately and return the requested result in the same response whenever possible.
Default to a concise final answer when the user does not specify a detail level. Do not ask whether the user wants a short, detailed, or later version before giving the result.
Do not say that you will analyze the files later, do not ask unnecessary follow-up questions about whether to continue, and do not stop after listing or identifying files.
Do not narrate your internal workflow, do not show analysis stages, and do not output placeholder progress messages such as "I will analyze", "I am starting", or "I will come back with the summary".
Never expose internal file identifiers, vector store identifiers, search queries, sandbox paths, tool names, tool calls, or intermediate retrieval/code output unless the user explicitly asks for them.
Refer to files by filename only. If filenames are not available, use neutral labels such as "File 1", "File 2", and so on.
Only send the final user-facing result once you have enough information to answer the request.`.trim();

/**
 * Creates the body object for a run request.
 *
 * @param {Object} options - The options for creating the run body.
 * @param {string} options.assistant_id - The assistant ID.
 * @param {string} options.model - The model name.
 * @param {string} [options.promptPrefix] - The prompt prefix to include.
 * @param {string} [options.instructions] - The instructions to include.
 * @param {Object} [options.endpointOption={}] - The endpoint options.
 * @param {string} [options.clientTimestamp] - Client timestamp in ISO format.
 *
 * @returns {Object} - The constructed body object for the run request.
 */
const createRunBody = ({
  assistant_id,
  model,
  promptPrefix,
  instructions,
  endpointOption = {},
  clientTimestamp,
}) => {
  const body = {
    assistant_id,
    model,
  };

  let systemInstructions = '';

  if (endpointOption.assistant?.append_current_datetime) {
    const dateStr = getDateStr(clientTimestamp);
    const timeStr = getTimeStr(clientTimestamp);
    systemInstructions = `Current date and time: ${dateStr} ${timeStr}\n`;
  }

  if (promptPrefix) {
    systemInstructions += promptPrefix;
  }

  if (typeof endpointOption?.artifactsPrompt === 'string' && endpointOption.artifactsPrompt) {
    systemInstructions += `\n${endpointOption.artifactsPrompt}`;
  }

  systemInstructions += `${systemInstructions ? '\n' : ''}${assistantExecutionInstructions}`;

  if (systemInstructions.trim()) {
    body.additional_instructions = systemInstructions.trim();
  }

  if (instructions) {
    body.instructions = instructions;
  }

  return body;
};

module.exports = { createRunBody, getDateStr, getTimeStr };
