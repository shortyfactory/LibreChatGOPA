import { EToolResources, PermissionBits, ResourceType, SystemRoles } from 'librechat-data-provider';
import { checkAgentUploadAuth } from './auth';

describe('checkAgentUploadAuth', () => {
  const checkPermission = jest.fn();

  beforeEach(() => {
    checkPermission.mockReset();
  });

  it('allows chat message attachments for non-admin users', async () => {
    const getAgent = jest.fn();

    const result = await checkAgentUploadAuth(
      {
        userId: 'user-123',
        userRole: SystemRoles.USER,
        agentId: 'agent_123',
        toolResource: 'context',
        messageFile: true,
      },
      { getAgent, checkPermission },
    );

    expect(result).toEqual({ allowed: true });
    expect(getAgent).not.toHaveBeenCalled();
  });

  it('denies non-file-search builder uploads for non-admin users', async () => {
    const getAgent = jest.fn().mockResolvedValue({
      _id: 'db-agent-id',
      author: 'owner-123',
    });

    const result = await checkAgentUploadAuth(
      {
        userId: 'user-123',
        userRole: SystemRoles.USER,
        agentId: 'agent_123',
        toolResource: 'context',
      },
      { getAgent, checkPermission },
    );

    expect(result).toEqual({
      allowed: false,
      status: 403,
      error: 'Forbidden',
      message: 'Only admins can manage agent builder files',
    });
    expect(getAgent).toHaveBeenCalledWith({ id: 'agent_123' });
  });

  it('returns 404 for admin uploads targeting a missing agent', async () => {
    const getAgent = jest.fn().mockResolvedValue(null);

    const result = await checkAgentUploadAuth(
      {
        userId: 'admin-123',
        userRole: SystemRoles.ADMIN,
        agentId: 'agent_missing',
        toolResource: 'execute_code',
      },
      { getAgent, checkPermission },
    );

    expect(result).toEqual({
      allowed: false,
      status: 404,
      error: 'Not Found',
      message: 'Agent not found',
    });
    expect(getAgent).toHaveBeenCalledWith({ id: 'agent_missing' });
  });

  it('allows permanent agent builder uploads for admins when the agent exists', async () => {
    const getAgent = jest.fn().mockResolvedValue({
      _id: 'db-agent-id',
      author: 'user-123',
    });

    const result = await checkAgentUploadAuth(
      {
        userId: 'admin-123',
        userRole: SystemRoles.ADMIN,
        agentId: 'agent_123',
        toolResource: 'execute_code',
      },
      { getAgent, checkPermission },
    );

    expect(result).toEqual({ allowed: true });
    expect(getAgent).toHaveBeenCalledWith({ id: 'agent_123' });
  });

  it('allows file_search uploads for non-admin authors', async () => {
    const getAgent = jest.fn().mockResolvedValue({
      _id: 'db-agent-id',
      author: 'user-123',
    });

    const result = await checkAgentUploadAuth(
      {
        userId: 'user-123',
        userRole: SystemRoles.USER,
        agentId: 'agent_123',
        toolResource: EToolResources.file_search,
      },
      { getAgent, checkPermission },
    );

    expect(result).toEqual({ allowed: true });
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it('allows file_search uploads for non-admin editors', async () => {
    const getAgent = jest.fn().mockResolvedValue({
      _id: 'db-agent-id',
      author: 'owner-123',
    });
    checkPermission.mockResolvedValue(true);

    const result = await checkAgentUploadAuth(
      {
        userId: 'editor-123',
        userRole: SystemRoles.USER,
        agentId: 'agent_123',
        toolResource: EToolResources.file_search,
      },
      { getAgent, checkPermission },
    );

    expect(result).toEqual({ allowed: true });
    expect(checkPermission).toHaveBeenCalledWith({
      userId: 'editor-123',
      role: SystemRoles.USER,
      resourceType: ResourceType.AGENT,
      resourceId: 'db-agent-id',
      requiredPermission: PermissionBits.EDIT,
    });
  });

  it('denies file_search uploads for non-admin viewers', async () => {
    const getAgent = jest.fn().mockResolvedValue({
      _id: 'db-agent-id',
      author: 'owner-123',
    });
    checkPermission.mockResolvedValue(false);

    const result = await checkAgentUploadAuth(
      {
        userId: 'viewer-123',
        userRole: SystemRoles.USER,
        agentId: 'agent_123',
        toolResource: EToolResources.file_search,
      },
      { getAgent, checkPermission },
    );

    expect(result).toEqual({
      allowed: false,
      status: 403,
      error: 'Forbidden',
      message: 'You do not have permission to manage files for this agent',
    });
  });
});
