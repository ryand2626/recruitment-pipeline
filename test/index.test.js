const { init, app } = require('../index'); // Assuming init and app are exported
const container = require('../src/container');
const { initializeServices } = require('../src/service-registration');
const sgWebhook = require('@sendgrid/eventwebhook');

// Mock dependencies
jest.mock('../src/container', () => ({
  get: jest.fn(),
  register: jest.fn(),
}));
jest.mock('../src/service-registration', () => ({
  initializeServices: jest.fn(),
}));

// Logger mock that can be spied on per instance
const createMockLogger = () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

// Mock process.exit
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit called with ${code}`);
});
// Mock console.error for early init errors before logger is available
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(jest.fn());

jest.mock('@sendgrid/eventwebhook', () => ({
  verifyEventAndTimestamp: jest.fn(),
}));

describe('Application Initialization (init)', () => {
  let mockConfig;
  let loggerInstance;

  beforeEach(() => {
    mockExit.mockClear();
    mockConsoleError.mockClear(); // Clear console.error spy
    container.get.mockReset();
    initializeServices.mockClear();

    loggerInstance = createMockLogger(); // Create a fresh logger mock for each test
    
    container.get.mockImplementation((serviceName) => {
      if (serviceName === 'logger') {
        return loggerInstance;
      }
      if (serviceName === 'config') {
        return mockConfig;
      }
      if (serviceName === 'sendgridService') { // Mock sendgridService for webhook tests
        return { processWebhookEvent: jest.fn().mockResolvedValue(true) };
      }
      if (serviceName === 'outreachWorker') { // Mock outreachWorker for webhook
        return {}; // Provide a basic mock
      }
      return {
        on: jest.fn(),
        setupScheduledJobs: jest.fn(),
        listen: jest.fn().mockReturnThis(),
        address: jest.fn().mockReturnValue({ port: 3001 }),
      };
    });

    mockConfig = {
      database: { password: 'valid-password' },
      apify: { token: 'valid-apify-token' },
      apiKeys: { sendGrid: 'valid-sendgrid-key' },
      email: { sendgridWebhookSigningKey: 'valid-sg-webhook-key' },
      scheduledJobs: {},
    };
  });
  
  test('should exit if database password is missing', async () => {
    mockConfig.database.password = undefined;
    // For init errors that happen before logger is assigned from container, it uses console.error
    // So we check mockConsoleError here
    await expect(init()).rejects.toThrow('process.exit called with 1');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Database Password (POSTGRES_PASSWORD)'));
  });

  test('should exit if Apify token is missing', async () => {
    mockConfig.apify.token = null;
    await expect(init()).rejects.toThrow('process.exit called with 1');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Apify Token (APIFY_TOKEN)'));
  });

  test('should exit if SendGrid API key is missing', async () => {
    mockConfig.apiKeys.sendGrid = '';
    await expect(init()).rejects.toThrow('process.exit called with 1');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('SendGrid API Key (SENDGRID_API_KEY)'));
  });

  test('should exit if multiple critical configs are missing', async () => {
    mockConfig.database.password = undefined;
    mockConfig.apify.token = undefined;
    await expect(init()).rejects.toThrow('process.exit called with 1');
    expect(mockExit).toHaveBeenCalledWith(1);
    const errorMessage = mockConsoleError.mock.calls[0][0];
    expect(errorMessage).toContain('Database Password (POSTGRES_PASSWORD)');
    expect(errorMessage).toContain('Apify Token (APIFY_TOKEN)');
  });
  
  test('should not exit if all required configs are present', async () => {
    await init();
    expect(mockExit).not.toHaveBeenCalled();
    expect(loggerInstance.error).not.toHaveBeenCalled(); // Check instance logger error
    expect(loggerInstance.info).toHaveBeenCalledWith('✅ All pipeline services initialized successfully.');
    expect(loggerInstance.info).toHaveBeenCalledWith('✅ Jobs Pipeline application initialized successfully.');
  });
});

describe('SendGrid Webhook Security Logic', () => {
  let mockReq;
  let mockRes;
  let originalNodeEnv;
  let originalAllowInsecureWebhooks;
  let webhookHandler;
  let testLogger;
  let testConfig;

  beforeAll(async () => {
    // Find the webhook handler. This is a bit of a hack.
    // It assumes the route is added with app.post('/webhook/sendgrid', express.raw(), handler)
    const postRoute = app._router.stack.find(
      (layer) =>
        layer.route &&
        layer.route.path === '/webhook/sendgrid' &&
        layer.route.methods.post
    );
    // The actual handler is the last one in the stack for that route,
    // after express.raw() middleware.
    webhookHandler = postRoute.route.stack.pop().handle;
  });

  beforeEach(() => {
    testLogger = createMockLogger();
    testConfig = {
      email: { sendgridWebhookSigningKey: 'default-key' },
      // other config parts if needed by the handler
    };

    container.get.mockImplementation((serviceName) => {
      if (serviceName === 'logger') return testLogger;
      if (serviceName === 'config') return testConfig;
      if (serviceName === 'sendgridService') return { processWebhookEvent: jest.fn().mockResolvedValue(null) };
      if (serviceName === 'outreachWorker') return {}; // Basic mock
      return jest.fn();
    });

    mockReq = {
      headers: {
        'x-twilio-email-event-webhook-signature': 'valid-signature',
        'x-twilio-email-event-webhook-timestamp': 'valid-timestamp',
      },
      body: Buffer.from(JSON.stringify([{ event: 'test' }])), // Raw body as buffer
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    sgWebhook.verifyEventAndTimestamp.mockReset();

    originalNodeEnv = process.env.NODE_ENV;
    originalAllowInsecureWebhooks = process.env.ALLOW_INSECURE_WEBHOOKS;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.ALLOW_INSECURE_WEBHOOKS = originalAllowInsecureWebhooks;
  });

  test('Production, Key Missing: should return 403 and log error', async () => {
    process.env.NODE_ENV = 'production';
    testConfig.email.sendgridWebhookSigningKey = '';
    
    await webhookHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Webhook signing key is missing. Configuration error.' });
    expect(testLogger.error).toHaveBeenCalledWith('CRITICAL: SendGrid webhook signing key is missing in PRODUCTION. Aborting webhook processing.');
  });

  test('Non-Production, Key Missing, No Override: should return 403 and log error', async () => {
    process.env.NODE_ENV = 'development';
    testConfig.email.sendgridWebhookSigningKey = '';
    process.env.ALLOW_INSECURE_WEBHOOKS = 'false'; // or undefined

    await webhookHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Webhook signing key is missing and insecure webhooks are not explicitly allowed for non-production. Aborting.' });
    expect(testLogger.error).toHaveBeenCalledWith('ERROR: SendGrid webhook signing key is missing. ALLOW_INSECURE_WEBHOOKS is not set for non-production. Aborting webhook processing.');
  });

  test('Non-Production, Key Missing, Override True: should log warning and proceed', async () => {
    process.env.NODE_ENV = 'development';
    testConfig.email.sendgridWebhookSigningKey = '';
    process.env.ALLOW_INSECURE_WEBHOOKS = 'true';

    await webhookHandler(mockReq, mockRes);

    expect(testLogger.warn).toHaveBeenCalledWith('WARNING: SendGrid webhook signing key is missing. Skipping signature verification as ALLOW_INSECURE_WEBHOOKS is true in non-production environment.');
    // Check if it proceeded to process events (mocked sendgridService.processWebhookEvent)
    const sendgridServiceMock = container.get('sendgridService');
    expect(sendgridServiceMock.processWebhookEvent).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(200); // Assuming it completes successfully after skipping verification
  });

  test('Key Present, Verification Fails: should return 403', async () => {
    testConfig.email.sendgridWebhookSigningKey = 'a-valid-key';
    sgWebhook.verifyEventAndTimestamp.mockReturnValue(false);

    await webhookHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.send).toHaveBeenCalledWith('Invalid webhook signature.');
    expect(testLogger.warn).toHaveBeenCalledWith('Invalid SendGrid webhook signature.');
  });
  
  test('Key Present, Verification Fails (due to exception): should return 400', async () => {
    testConfig.email.sendgridWebhookSigningKey = 'a-valid-key';
    sgWebhook.verifyEventAndTimestamp.mockImplementation(() => {
      throw new Error('Verification lib error');
    });

    await webhookHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.send).toHaveBeenCalledWith('Error verifying webhook signature.');
    expect(testLogger.error).toHaveBeenCalledWith('Error during SendGrid webhook signature verification', { error: 'Verification lib error' });
  });


  test('Key Present, Verification Succeeds: should proceed to process events and return 200', async () => {
    testConfig.email.sendgridWebhookSigningKey = 'a-valid-key';
    sgWebhook.verifyEventAndTimestamp.mockReturnValue(true);
    mockReq.body = Buffer.from(JSON.stringify([{ event: 'delivered' }, {event: 'opened'}]));


    await webhookHandler(mockReq, mockRes);

    expect(testLogger.info).toHaveBeenCalledWith('SendGrid webhook signature verified successfully.');
    const sendgridServiceMock = container.get('sendgridService');
    expect(sendgridServiceMock.processWebhookEvent).toHaveBeenCalledTimes(2);
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      message: "Events received",
      received: 2,
    }));
  });

   test('Should return 400 if headers for signature are missing', async () => {
    testConfig.email.sendgridWebhookSigningKey = 'a-valid-key';
    mockReq.headers = {}; // Missing signature headers

    await webhookHandler(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.send).toHaveBeenCalledWith('Missing signature/timestamp headers.');
    expect(testLogger.warn).toHaveBeenCalledWith('SendGrid webhook request missing signature or timestamp headers.');
  });

  test('Should return 400 if body is not valid JSON', async () => {
    testConfig.email.sendgridWebhookSigningKey = 'a-valid-key';
    sgWebhook.verifyEventAndTimestamp.mockReturnValue(true);
    mockReq.body = Buffer.from('this is not json');

    await webhookHandler(mockReq, mockRes);
    
    expect(testLogger.error).toHaveBeenCalledWith('Failed to parse webhook JSON payload after raw body read.', {error: expect.any(String)});
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid JSON payload' });
  });

  test('Should return 400 if body is not an array of events', async () => {
    testConfig.email.sendgridWebhookSigningKey = 'a-valid-key';
    sgWebhook.verifyEventAndTimestamp.mockReturnValue(true);
    mockReq.body = Buffer.from(JSON.stringify({ event: 'test' })); // Object, not array

    await webhookHandler(mockReq, mockRes);
    
    expect(testLogger.warn).toHaveBeenCalledWith('Received non-array webhook data from SendGrid', { data: {event: 'test'} });
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Expected array of events' });
  });

});
