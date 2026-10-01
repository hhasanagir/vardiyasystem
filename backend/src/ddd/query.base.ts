import { v4 as uuidv4 } from 'uuid';

export abstract class Query<TResult = unknown> {
  public readonly queryId: string;
  public readonly queryName: string;
  public readonly timestamp: Date;

  constructor() {
    this.queryId = uuidv4();
    this.queryName = this.constructor.name;
    this.timestamp = new Date();
  }
}
