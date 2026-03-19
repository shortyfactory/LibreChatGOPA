import type { Model, Types } from 'mongoose';
import type { IAgentCategory } from '~/types';

const defaultCategories = [
  {
    value: 'general_support',
    label: 'General Support',
    description: 'Agents for broad support tasks, common requests, and everyday assistance.',
    order: 0,
  },
  {
    value: 'writing_communication',
    label: 'Writing & Communication',
    description: 'Agents for drafting, editing, messaging, and communication support.',
    order: 1,
  },
  {
    value: 'research_analysis',
    label: 'Research & Analysis',
    description: 'Agents for research, synthesis, due diligence, and analytical work.',
    order: 2,
  },
  {
    value: 'project_management',
    label: 'Project Management',
    description: 'Agents for planning, tracking, coordination, and delivery support.',
    order: 3,
  },
  {
    value: 'business_development',
    label: 'Business Development',
    description: 'Agents for pipeline support, proposals, partnerships, and growth activities.',
    order: 4,
  },
  {
    value: 'hr_talent',
    label: 'HR & Talent',
    description: 'Agents for recruitment, people operations, and talent-related processes.',
    order: 5,
  },
  {
    value: 'finance_administration',
    label: 'Finance & Administration',
    description: 'Agents for finance, operations, budgeting, and administrative support.',
    order: 6,
  },
  {
    value: 'it_digital_tools',
    label: 'IT & Digital Tools',
    description: 'Agents for IT support, digital tooling, workflows, and troubleshooting.',
    order: 7,
  },
  {
    value: 'knowledge_management',
    label: 'Knowledge Management',
    description: 'Agents for organizing, structuring, and maintaining institutional knowledge.',
    order: 8,
  },
  {
    value: 'translation_localization',
    label: 'Translation & Localization',
    description: 'Agents for multilingual work, translation, and localization tasks.',
    order: 9,
  },
] as const;

const legacyCategoryMappings: Record<string, string> = {
  general: 'general_support',
  hr: 'hr_talent',
  rd: 'research_analysis',
  finance: 'finance_administration',
  it: 'it_digital_tools',
  sales: 'business_development',
  aftersales: 'project_management',
};

export function createAgentCategoryMethods(mongoose: typeof import('mongoose')) {
  /**
   * Get all active categories sorted by order
   * @returns Array of active categories
   */
  async function getActiveCategories(): Promise<IAgentCategory[]> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    return await AgentCategory.find({ isActive: true }).sort({ order: 1, label: 1 }).lean();
  }

  /**
   * Get categories with agent counts
   * @returns Categories with agent counts
   */
  async function getCategoriesWithCounts(): Promise<(IAgentCategory & { agentCount: number })[]> {
    const Agent = mongoose.models.Agent;

    const categoryCounts = await Agent.aggregate([
      { $match: { category: { $exists: true, $ne: null } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(categoryCounts.map((c) => [c._id, c.count]));
    const categories = await getActiveCategories();

    return categories.map((category) => ({
      ...category,
      agentCount: countMap.get(category.value) || (0 as number),
    })) as (IAgentCategory & { agentCount: number })[];
  }

  /**
   * Get valid category values for Agent model validation
   * @returns Array of valid category values
   */
  async function getValidCategoryValues(): Promise<string[]> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    return await AgentCategory.find({ isActive: true }).distinct('value').lean();
  }

  /**
   * Seed initial categories from existing constants
   * @param categories - Array of category data to seed
   * @returns Bulk write result
   */
  async function seedCategories(
    categories: Array<{
      value: string;
      label?: string;
      description?: string;
      order?: number;
      custom?: boolean;
    }>,
  ): Promise<import('mongoose').mongo.BulkWriteResult> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;

    const operations = categories.map((category, index) => ({
      updateOne: {
        filter: { value: category.value },
        update: {
          $setOnInsert: {
            value: category.value,
            label: category.label || category.value,
            description: category.description || '',
            order: category.order || index,
            isActive: true,
            custom: category.custom || false,
          },
        },
        upsert: true,
      },
    }));

    return await AgentCategory.bulkWrite(operations);
  }

  /**
   * Find a category by value
   * @param value - The category value to search for
   * @returns The category document or null
   */
  async function findCategoryByValue(value: string): Promise<IAgentCategory | null> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    return await AgentCategory.findOne({ value }).lean();
  }

  /**
   * Create a new category
   * @param categoryData - The category data to create
   * @returns The created category
   */
  async function createCategory(categoryData: Partial<IAgentCategory>): Promise<IAgentCategory> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    const category = await AgentCategory.create(categoryData);
    return category.toObject() as IAgentCategory;
  }

  /**
   * Update a category by value
   * @param value - The category value to update
   * @param updateData - The data to update
   * @returns The updated category or null
   */
  async function updateCategory(
    value: string,
    updateData: Partial<IAgentCategory>,
  ): Promise<IAgentCategory | null> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    return await AgentCategory.findOneAndUpdate(
      { value },
      { $set: updateData },
      { new: true, runValidators: true },
    ).lean();
  }

  /**
   * Delete a category by value
   * @param value - The category value to delete
   * @returns Whether the deletion was successful
   */
  async function deleteCategory(value: string): Promise<boolean> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    const result = await AgentCategory.deleteOne({ value });
    return result.deletedCount > 0;
  }

  /**
   * Find a category by ID
   * @param id - The category ID to search for
   * @returns The category document or null
   */
  async function findCategoryById(id: string | Types.ObjectId): Promise<IAgentCategory | null> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    return await AgentCategory.findById(id).lean();
  }

  /**
   * Get all categories (active and inactive)
   * @returns Array of all categories
   */
  async function getAllCategories(): Promise<IAgentCategory[]> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    return await AgentCategory.find({}).sort({ order: 1, label: 1 }).lean();
  }

  /**
   * Ensure default categories exist and update them if they don't have localization keys
   * @returns Promise<boolean> - true if categories were created/updated, false if no changes
   */
  async function ensureDefaultCategories(): Promise<boolean> {
    const AgentCategory = mongoose.models.AgentCategory as Model<IAgentCategory>;
    const Agent = mongoose.models.Agent;
    const defaultValueSet = new Set(defaultCategories.map((category) => category.value));
    const defaultCategoryMap = new Map(
      defaultCategories.map((category) => [category.value, category]),
    );

    const existingCategories = await getAllCategories();
    const existingCategoryMap = new Map(existingCategories.map((cat) => [cat.value, cat]));
    let changed = false;

    for (const [legacyValue, nextValue] of Object.entries(legacyCategoryMappings)) {
      const legacyCategory = existingCategoryMap.get(legacyValue);
      if (!legacyCategory || legacyCategory.custom) {
        continue;
      }

      const nextCategory = defaultCategoryMap.get(nextValue);
      if (!nextCategory) {
        continue;
      }

      await Agent.updateMany({ category: legacyValue }, { $set: { category: nextValue } });

      if (!existingCategoryMap.has(nextValue)) {
        await AgentCategory.updateOne(
          { value: legacyValue, custom: { $ne: true } },
          {
            $set: {
              value: nextCategory.value,
              label: nextCategory.label,
              description: nextCategory.description,
              order: nextCategory.order,
              isActive: true,
            },
          },
        );
        changed = true;
      } else {
        if (legacyCategory.isActive !== false) {
          await AgentCategory.updateOne(
            { value: legacyValue, custom: { $ne: true } },
            {
              $set: {
                isActive: false,
              },
            },
          );
          changed = true;
        }
      }
    }

    const refreshedCategories = await getAllCategories();
    const refreshedCategoryMap = new Map(refreshedCategories.map((cat) => [cat.value, cat]));

    for (const defaultCategory of defaultCategories) {
      const existingCategory = refreshedCategoryMap.get(defaultCategory.value);

      if (existingCategory) {
        if (existingCategory.custom) {
          continue;
        }

        const needsUpdate =
          existingCategory.label !== defaultCategory.label ||
          existingCategory.description !== defaultCategory.description ||
          existingCategory.order !== defaultCategory.order ||
          existingCategory.isActive !== true;

        if (needsUpdate) {
          await AgentCategory.updateOne(
            { value: defaultCategory.value, custom: { $ne: true } },
            {
              $set: {
                label: defaultCategory.label,
                description: defaultCategory.description,
                order: defaultCategory.order,
                isActive: true,
              },
            },
          );
          changed = true;
        }
        continue;
      }

      await createCategory({
        ...defaultCategory,
        isActive: true,
        custom: false,
      });
      changed = true;
    }

    const categoriesToDeactivate = refreshedCategories.filter(
      (category) =>
        !category.custom && category.isActive !== false && !defaultValueSet.has(category.value),
    );

    if (categoriesToDeactivate.length > 0) {
      await AgentCategory.bulkWrite(
        categoriesToDeactivate.map((category) => ({
          updateOne: {
            filter: { value: category.value, custom: { $ne: true } },
            update: {
              $set: {
                isActive: false,
              },
            },
          },
        })),
        { ordered: false },
      );
      changed = true;
    }

    return changed;
  }

  return {
    getActiveCategories,
    getCategoriesWithCounts,
    getValidCategoryValues,
    seedCategories,
    findCategoryByValue,
    createCategory,
    updateCategory,
    deleteCategory,
    findCategoryById,
    getAllCategories,
    ensureDefaultCategories,
  };
}

export type AgentCategoryMethods = ReturnType<typeof createAgentCategoryMethods>;
