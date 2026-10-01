import { v4 as uuidv4 } from 'uuid';

export abstract class Command<TResult = void> {
  public readonly commandId: string;
  public readonly commandName: string;
  public readonly timestamp: Date;

  constructor() {
    this.commandId = uuidv4();
    this.commandName = this.constructor.name;
    this.timestamp = new Date();
  }
}
