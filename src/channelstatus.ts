import {Socket} from "socket.io";

export class ChannelStatus {
  public readonly sockets: Map<string, Socket>;
  public readonly votes: Map<string, number>;
  public vote: number | null;
  public lastVoteAt: number | null;

  constructor() {
    this.sockets = new Map();
    this.votes = new Map();
    this.vote = null;
    this.lastVoteAt = null;
  }

  clear() {
    this.votes.clear();
    this.vote = null;
    this.lastVoteAt = null;
  }

}
