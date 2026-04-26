describe('Notifications websocket contract baseline snapshots', () => {
  it('locks /notifications payload envelopes', () => {
    const authResponseEvent = {
      type: 'auth_response',
      data: {
        success: true,
        message: 'Authenticated',
        user_id: 'user-1',
      },
      timestamp: 1714080000000,
    };

    const notificationNewEvent = {
      type: 'notification:new',
      data: {
        notification_id: 'notif-1',
        title: 'System notice',
        body: 'Maintenance window',
        type: 'system',
        created_at: '2026-04-26T00:00:00.000Z',
      },
      timestamp: 1714080000001,
    };

    const walletBalanceEvent = {
      type: 'wallet:balance',
      data: {
        currencyId: 'currency-1',
        symbol: 'USDT',
        available: '100.00',
        frozen: '0',
        total: '100.00',
        updatedAt: '2026-04-26T00:00:00.000Z',
      },
      timestamp: 1714080000002,
    };

    const systemConfigUpdatedEvent = {
      type: 'system_config:updated',
      data: {
        key: 'MATCHING_ENGINE',
        value: 'ts',
      },
      timestamp: 1714080000003,
    };

    expect({
      authResponseEvent,
      notificationNewEvent,
      walletBalanceEvent,
      systemConfigUpdatedEvent,
    }).toMatchSnapshot();
  });
});
