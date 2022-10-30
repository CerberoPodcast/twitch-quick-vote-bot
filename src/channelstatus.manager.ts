import {ChannelStatus} from "./channelstatus.js";

export class ChannelStatusManager {

  private channelStatuses = new Map<string, ChannelStatus>;

  getStatus(channel: string): ChannelStatus | null {
    return this.channelStatuses.get(channel) || null;
  }

  getOrCreateStatus(channel: string): ChannelStatus {
    let status = this.channelStatuses.get(channel);
    if (!status) {
      status = new ChannelStatus();
      this.channelStatuses.set(channel, status);
    } else if (status.lastVoteAt && (Date.now() - status.lastVoteAt) > Number(process.env.VOTE_TTL)) {
      status.votes.clear();
    }
    return status;
  }

}
