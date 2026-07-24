declare module "homebridge-miot/lib/protocol/MiioProtocol.js" {
  type Logger = { debug(message: string): void; deepDebug(message: string): void };
  export default class MiioProtocol {
    constructor(logger: Logger);
    updateDevice(address: string, data: { token: string }): void;
    send(address: string, method: string, params: unknown[], options?: { timeout?: number; retries?: number }): Promise<unknown>;
    destroy(): void;
  }
}

declare module "homebridge-miot/lib/protocol/MiCloud.js" {
  type Logger = { debug(message: string): void; deepDebug(message: string): void };
  type CloudSession = {
    ssecurity: string;
    userId: string;
    serviceToken: string;
    agentId?: string;
    clientId?: string;
    timestamp?: number;
    loginMethod?: string;
  };
  export default class MiCloud {
    constructor(logger: Logger);
    setCountry(country: string): void;
    setRequestTimeout(timeout: number): void;
    setServiceToken(session: CloudSession): void;
    isLoggedIn(): boolean;
    login(username: string, password: string): Promise<void>;
    miotGetProps(params: unknown[]): Promise<unknown>;
    miotSetProps(params: unknown[]): Promise<unknown>;
  }
}
