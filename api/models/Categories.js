const { logger } = require('@librechat/data-schemas');

const options = [
  {
    label: 'com_ui_writing_editing',
    value: 'writing_editing',
  },
  {
    label: 'com_ui_translation_localization',
    value: 'translation_localization',
  },
  {
    label: 'com_ui_meetings_summaries',
    value: 'meetings_summaries',
  },
  {
    label: 'com_ui_research_analysis',
    value: 'research_analysis',
  },
  {
    label: 'com_ui_brainstorming_ideation',
    value: 'brainstorming_ideation',
  },
  {
    label: 'com_ui_formatting_structuring',
    value: 'formatting_structuring',
  },
  {
    label: 'com_ui_general_support',
    value: 'general_support',
  },
];

module.exports = {
  /**
   * Retrieves the categories asynchronously.
   * @returns {Promise<TGetCategoriesResponse>} An array of category objects.
   * @throws {Error} If there is an error retrieving the categories.
   */
  getCategories: async () => {
    try {
      // const categories = await Categories.find();
      return options;
    } catch (error) {
      logger.error('Error getting categories', error);
      return [];
    }
  },
};
