const express = require('express');
const { Keyv } = require('keyv');
const { logger, ELIGIBLE_CONTEXTS } = require('@librechat/data-schemas');
const {
  keyvMongo,
  requireAdmin,
  createAdminBanResponse,
  createAdminUsersResponse,
  createAdminUnbanResponse,
  createAdminModerationResponse,
  createAdminDeleteUserResponse,
  createAdminUserSearchParams,
  createAdminDeepLJobsResponse,
  parseAdminBanDurationMinutes,
  createAdminResetPasswordResponse,
  createAdminFileRetentionResponse,
  createAdminAnalyticsUsersResponse,
  createAdminDeepLJobSearchParams,
  validateAdminFileRetentionUpdate,
  createAdminFileRetentionUpdateResponse,
} = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const middleware = require('~/server/middleware');
const { getLogStores } = require('~/cache');
const { requestPasswordReset } = require('~/server/services/AuthService');
const { getAppConfig } = require('~/server/services/Config');
const { purgeAllSidebarUploadsNow } = require('~/server/services/FileRetentionService');
const {
  deleteAllUserSessions,
  getSidebarFileRetentionSettings,
  updateSidebarFileRetentionSettings,
  getSidebarUploadCountsByUserIds,
  syncSidebarUploadCountsFromFiles,
  searchDeepLJobs,
} = require('~/models');
const {
  Key,
  File,
  Agent,
  Token,
  Group,
  Action,
  Preset,
  Prompt,
  Balance,
  Message,
  Session,
  AclEntry,
  ToolCall,
  Assistant,
  SharedLink,
  PluginAuth,
  MemoryEntry,
  PromptGroup,
  Transaction,
  Conversation,
  ConversationTag,
  User,
} = require('~/db/models');

const router = express.Router();
const banCacheStore = new Keyv({ store: keyvMongo, namespace: ViolationTypes.BAN, ttl: 0 });

const clearBanCacheForUser = async (userId) => {
  const normalizedUserId = String(userId);
  const keys = [normalizedUserId, `ban_cache:user:${normalizedUserId}`];

  for (const key of keys) {
    try {
      await banCacheStore.delete(key);
    } catch (error) {
      logger.warn(`[admin] Could not clear ban cache key "${key}"`, error);
    }
  }
};

const deleteUserAndRelatedData = async (user) => {
  const userId = String(user._id);

  await Promise.all([
    Action.deleteMany({ user: userId }),
    Agent.deleteMany({ author: userId }),
    Assistant.deleteMany({ user: userId }),
    Balance.deleteMany({ user: userId }),
    ConversationTag.deleteMany({ user: userId }),
    Conversation.deleteMany({ user: userId }),
    Message.deleteMany({ user: userId }),
    File.deleteMany({ user: userId }),
    Key.deleteMany({ userId }),
    MemoryEntry.deleteMany({ userId }),
    PluginAuth.deleteMany({ userId }),
    Prompt.deleteMany({ author: userId }),
    PromptGroup.deleteMany({ author: userId }),
    Preset.deleteMany({ user: userId }),
    Session.deleteMany({ user: userId }),
    SharedLink.deleteMany({ user: userId }),
    ToolCall.deleteMany({ user: userId }),
    Token.deleteMany({ userId }),
    AclEntry.deleteMany({ principalId: user._id }),
    Transaction.deleteMany({ user: userId }),
  ]);

  await Group.updateMany({ memberIds: user._id }, { $pull: { memberIds: user._id } });
  await deleteAllUserSessions({ userId });
  await User.deleteOne({ _id: userId });
  await clearBanCacheForUser(userId);
};

router.use(middleware.requireJwtAuth);
router.use(requireAdmin);

router.get('/moderation', async (req, res) => {
  try {
    const response = await createAdminModerationResponse({
      query: req.query,
      env: process.env,
      violationStore: getLogStores(ViolationTypes.GENERAL),
      banStore: getLogStores(ViolationTypes.BAN),
    });
    return res.status(200).json(response);
  } catch (error) {
    logger.error('[admin] Failed to build moderation admin data', error);
    return res.status(500).json({ message: 'Failed to retrieve moderation data' });
  }
});

router.get('/users', async (req, res) => {
  try {
    const searchParams = createAdminUserSearchParams(req.query);
    const [totalUsers, users] = await Promise.all([
      User.countDocuments(searchParams.filter),
      User.find(
        searchParams.filter,
        'email provider avatar username name role emailVerified createdAt updatedAt',
      )
        .sort({ createdAt: -1 })
        .skip(searchParams.skip)
        .limit(searchParams.limit)
        .lean(),
    ]);
    const response = await createAdminUsersResponse({
      query: req.query,
      totalUsers,
      users,
      banStore: getLogStores(ViolationTypes.BAN),
    });

    return res.status(200).json(response);
  } catch (error) {
    logger.error('[admin] Failed to build admin users data', error);
    return res.status(500).json({ message: 'Failed to retrieve users' });
  }
});

router.get('/analytics/users', async (req, res) => {
  try {
    const searchParams = createAdminUserSearchParams(req.query);
    const [totalUsers, users] = await Promise.all([
      User.countDocuments(searchParams.filter),
      User.find(searchParams.filter, 'email username name role createdAt')
        .sort({ createdAt: -1 })
        .skip(searchParams.skip)
        .limit(searchParams.limit)
        .lean(),
    ]);

    const userIds = users.map((user) => user._id);
    const userIdStrings = users.map((user) => String(user._id));

    if (userIds.length > 0) {
      await syncSidebarUploadCountsFromFiles({ userIds });
    }

    const [
      promptCounts,
      agentCounts,
      conversationCounts,
      promptGroupCounts,
      presetCounts,
      fileCounts,
      uploadCountMap,
    ] = await Promise.all([
      Prompt.aggregate([
        { $match: { author: { $in: userIds } } },
        { $group: { _id: '$author', count: { $sum: 1 } } },
      ]),
      Agent.aggregate([
        { $match: { author: { $in: userIds } } },
        { $group: { _id: '$author', count: { $sum: 1 } } },
      ]),
      Conversation.aggregate([
        { $match: { user: { $in: userIdStrings } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
      PromptGroup.aggregate([
        { $match: { author: { $in: userIds } } },
        { $group: { _id: '$author', count: { $sum: 1 } } },
      ]),
      Preset.aggregate([
        { $match: { user: { $in: userIdStrings } } },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
      File.aggregate([
        {
          $match: {
            user: { $in: userIds },
            $or: [{ retentionEligible: true }, { context: { $in: ELIGIBLE_CONTEXTS } }],
          },
        },
        { $group: { _id: '$user', count: { $sum: 1 } } },
      ]),
      getSidebarUploadCountsByUserIds(userIds),
    ]);

    const response = createAdminAnalyticsUsersResponse({
      query: req.query,
      totalUsers,
      users,
      promptCounts,
      agentCounts,
      conversationCounts,
      promptGroupCounts,
      presetCounts,
      fileCounts,
      uploadCountMap,
    });

    return res.status(200).json(response);
  } catch (error) {
    logger.error('[admin] Failed to build analytics admin users data', error);
    return res.status(500).json({ message: 'Failed to retrieve analytics users data' });
  }
});

router.get('/analytics/file-retention', async (_req, res) => {
  try {
    const settings = await getSidebarFileRetentionSettings();
    return res.status(200).json(createAdminFileRetentionResponse(settings));
  } catch (error) {
    logger.error('[admin] Failed to retrieve file retention settings', error);
    return res.status(500).json({ message: 'Failed to retrieve file retention settings' });
  }
});

router.patch('/analytics/file-retention', async (req, res) => {
  try {
    const validation = validateAdminFileRetentionUpdate(req.body ?? {});
    if (validation.ok !== true || validation.update == null) {
      return res.status(400).json({
        message: validation.message ?? 'Invalid file retention configuration',
      });
    }

    const settings = await updateSidebarFileRetentionSettings(validation.update);
    return res.status(200).json(createAdminFileRetentionUpdateResponse(settings));
  } catch (error) {
    logger.error('[admin] Failed to update file retention settings', error);
    return res.status(500).json({ message: 'Failed to update file retention settings' });
  }
});

router.post('/analytics/file-retention/purge', async (req, res) => {
  try {
    const appConfig = req.config ?? (await getAppConfig({ role: req.user?.role }));
    const result = await purgeAllSidebarUploadsNow(appConfig);

    if (result?.skipped && result.reason === 'cleanup_in_progress') {
      return res.status(409).json({
        message: 'A file cleanup is already in progress. Please try again in a moment.',
      });
    }

    if (result?.skipped && result.reason === 'missing_app_config') {
      return res.status(500).json({
        message: 'Unable to load the current app configuration for file cleanup.',
      });
    }

    return res.status(200).json({
      purged: true,
      attemptedDeletes: Number(result?.attemptedDeletes ?? 0),
    });
  } catch (error) {
    logger.error('[admin] Failed to purge uploaded files immediately', error);
    return res.status(500).json({ message: 'Failed to purge uploaded files immediately' });
  }
});

router.get('/analytics/deepl-jobs', async (req, res) => {
  try {
    const queryResult = await searchDeepLJobs(createAdminDeepLJobSearchParams(req.query));
    return res.status(200).json(createAdminDeepLJobsResponse(queryResult));
  } catch (error) {
    logger.error('[admin] Failed to retrieve analytics DeepL jobs data', error);
    return res.status(500).json({ message: 'Failed to retrieve analytics DeepL jobs data' });
  }
});

router.post('/users/:userId/ban', async (req, res) => {
  try {
    const { userId } = req.params;
    const durationMinutes = parseAdminBanDurationMinutes(req.body?.durationMinutes, 120);
    const targetUser = await User.findById(userId, '_id email role').lean();

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (String(targetUser._id) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot ban your own account' });
    }

    const durationMs = durationMinutes * 60 * 1000;
    const expiresAt = Date.now() + durationMs;
    const payload = {
      type: ViolationTypes.CONCURRENT,
      user_id: String(targetUser._id),
      violation_count: 20,
      duration: durationMs,
      expiresAt,
      byAdmin: true,
      by: String(req.user.id),
    };

    await getLogStores(ViolationTypes.BAN).set(String(targetUser._id), payload);
    await clearBanCacheForUser(targetUser._id);
    await deleteAllUserSessions({ userId: String(targetUser._id) });

    return res
      .status(200)
      .json(createAdminBanResponse(String(targetUser._id), durationMinutes, expiresAt));
  } catch (error) {
    logger.error('[admin] Error banning user', error);
    return res.status(500).json({ message: 'Failed to ban user' });
  }
});

router.post('/users/:userId/unban', async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId, '_id email').lean();

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    await getLogStores(ViolationTypes.BAN).delete(String(targetUser._id));
    await clearBanCacheForUser(targetUser._id);

    return res.status(200).json(createAdminUnbanResponse(String(targetUser._id)));
  } catch (error) {
    logger.error('[admin] Error unbanning user', error);
    return res.status(500).json({ message: 'Failed to unban user' });
  }
});

router.post('/users/:userId/reset-password', async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId, '_id email').lean();

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    const result = await requestPasswordReset({
      body: { email: targetUser.email },
      ip: req.ip,
    });

    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }

    return res.status(200).json(createAdminResetPasswordResponse(String(targetUser._id), result));
  } catch (error) {
    logger.error('[admin] Error triggering password reset', error);
    return res.status(500).json({ message: 'Failed to trigger password reset' });
  }
});

router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId, '_id email role').lean();

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (String(targetUser._id) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    await deleteUserAndRelatedData(targetUser);

    return res
      .status(200)
      .json(createAdminDeleteUserResponse(String(targetUser._id), targetUser.email ?? null));
  } catch (error) {
    logger.error('[admin] Error deleting user', error);
    return res.status(500).json({ message: 'Failed to delete user' });
  }
});

module.exports = router;
