import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { Process } from '../src/stryker/process/Process.js';
import { StrykerServer } from '../src/stryker/server/StrykerServer.js';
import { StdioTransport } from '../src/stryker/transport/StdioTransport.js';
import { Logger } from '../src/stryker/logging/Logger.js';
import { ProcessConfig } from '../src/stryker/process/ProcessConfig.js';

/**
 * Test suite for verifying crash recovery behavior.
 * This tests the critical functionality where a crashed/killed server
 * can be restarted by ensuring the 'exit' event properly resets state.
 */
describe('StrykerServer crash recovery', () => {
  let mockProcess: jest.Mocked<Process>;
  let mockTransport: jest.Mocked<StdioTransport>;
  let mockLogger: jest.Mocked<Logger>;
  let processConfig: ProcessConfig;
  let strykerServer: StrykerServer;
  let processEmitter: EventEmitter;

  beforeEach(() => {
    // Create an EventEmitter to simulate process events
    processEmitter = new EventEmitter();

    // Mock Process with EventEmitter methods
    mockProcess = Object.assign(processEmitter, {
      init: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      write: jest.fn(),
      dispose: jest.fn(),
    }) as unknown as jest.Mocked<Process>;

    // Mock Transport
    mockTransport = {
      init: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      send: jest.fn(),
      dispose: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
      messages: {
        subscribe: jest.fn((callback) => {
          // Return a mock subscription
          return { unsubscribe: jest.fn() };
        }),
      },
      notifications: {
        pipe: jest.fn(),
      },
      connected: false,
    } as unknown as jest.Mocked<StdioTransport>;

    // Mock Logger
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    // Process config
    processConfig = {
      path: 'npx',
      args: ['stryker', 'serve', 'stdio'],
      cwd: '/test/path',
    };

    // Create StrykerServer instance
    strykerServer = new StrykerServer(
      mockProcess,
      mockTransport,
      mockLogger,
      processConfig
    );
  });

  afterEach(() => {
    processEmitter.removeAllListeners();
  });

  it('should reset initialized flag when process exits', async () => {
    // Mock the configure call to prevent actual RPC
    const configureMock = jest.fn<() => Promise<{ version: string }>>().mockResolvedValue({ version: '1.0.0' });
    (strykerServer as any).configure = configureMock;

    // Initialize the server
    await strykerServer.init();
    
    // Verify server is initialized
    expect(strykerServer.isInitialized()).toBe(true);

    // Simulate process crash/exit
    processEmitter.emit('exit', 1, null);

    // Wait for event to be processed
    await new Promise(resolve => setImmediate(resolve));

    // Verify initialized flag was reset
    expect(strykerServer.isInitialized()).toBe(false);
  });

  it('should allow reinitialization after process crash', async () => {
    // Mock the configure call
    const configureMock = jest.fn<() => Promise<{ version: string }>>().mockResolvedValue({ version: '1.0.0' });
    (strykerServer as any).configure = configureMock;

    // First initialization
    await strykerServer.init();
    expect(strykerServer.isInitialized()).toBe(true);

    // Simulate crash
    processEmitter.emit('exit', 1, null);
    await new Promise(resolve => setImmediate(resolve));
    expect(strykerServer.isInitialized()).toBe(false);

    // Reset mocks for second init
    mockProcess.init.mockClear();
    mockTransport.init.mockClear();
    configureMock.mockClear();

    // Should be able to reinitialize
    await strykerServer.init();
    
    expect(mockProcess.init).toHaveBeenCalled();
    expect(mockTransport.init).toHaveBeenCalled();
    expect(configureMock).toHaveBeenCalled();
    expect(strykerServer.isInitialized()).toBe(true);
  });

  it('should log error message when process exits unexpectedly', async () => {
    // Mock the configure call
    const configureMock = jest.fn<() => Promise<{ version: string }>>().mockResolvedValue({ version: '1.0.0' });
    (strykerServer as any).configure = configureMock;

    await strykerServer.init();

    // Simulate exit with code and signal
    processEmitter.emit('exit', 137, 'SIGKILL');
    await new Promise(resolve => setImmediate(resolve));

    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('Process exited unexpectedly')
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining('137')
    );
  });

  it('should handle normal exit (code 0) as well', async () => {
    // Mock the configure call
    const configureMock = jest.fn<() => Promise<{ version: string }>>().mockResolvedValue({ version: '1.0.0' });
    (strykerServer as any).configure = configureMock;

    await strykerServer.init();
    expect(strykerServer.isInitialized()).toBe(true);

    // Simulate normal exit
    processEmitter.emit('exit', 0, null);
    await new Promise(resolve => setImmediate(resolve));

    // Still should reset state
    expect(strykerServer.isInitialized()).toBe(false);
  });

  it('should only attach exit handler once during init', async () => {
    const configureMock = jest.fn<() => Promise<{ version: string }>>().mockResolvedValue({ version: '1.0.0' });
    (strykerServer as any).configure = configureMock;

    // Count event listeners
    const initialListenerCount = processEmitter.listenerCount('exit');
    
    await strykerServer.init();
    
    const afterInitCount = processEmitter.listenerCount('exit');
    
    // Should have added exactly one listener
    expect(afterInitCount).toBe(initialListenerCount + 1);
  });
});
