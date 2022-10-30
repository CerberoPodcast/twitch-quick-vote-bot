import dotenv from "dotenv";
import {ChatClient} from "@twurple/chat";
import _ from "lodash";
import {ChannelStatusManager} from "./channelstatus.manager.js";
import express from "express";
import http from "http";
import {Server} from "socket.io";
import mustacheExpress from "mustache-express";

dotenv.config();

const VOTE_MATCHER_REGEX = /(^| )(?<vote>[1-9]0?([.,]5)?) *\/ *10\b/;

const channelStatusManager = new ChannelStatusManager();

const channels = process.env.CHANNELS?.split(',') || [];

const app = express();
const router = express.Router();
const server = http.createServer(app);
const io = new Server(server, {
  path: `${process.env.HTTP_PATH || ''}/socket.io/`,
});

const chatClient = new ChatClient({
  channels: channels,
});
await chatClient.connect();

async function resetVote(user: string, channel: string) {
  const status = channelStatusManager.getStatus(channel);
  if (!status) {
    return;
  }

  status.clear();

  console.log(`${user} performed a reset of ${channel}'s vote results!`);

  for (const socket of status.sockets.values()) {
    socket.emit('vote_update', {
      vote: status.vote,
    });
  }
}

async function handleMessage(channel: string, user: string, text: string) {
  const match = text.match(VOTE_MATCHER_REGEX);
  if (!match) {
    return;
  }
  let voteString = match.groups?.['vote'];
  if (!voteString) {
    return;
  }

  voteString = voteString.replace(/,/g, '.');
  const vote = Number(voteString);

  const status = channelStatusManager.getOrCreateStatus(channel);

  status.votes.set(user, vote);
  status.lastVoteAt = Date.now();

  status.vote = _.mean([...status.votes.values()]);
  status.vote = Math.trunc(status.vote) + (status.vote % 1 >= 0.5 ? 0.5 : 0);

  console.log(`${user} voted ${vote} on ${channel}'s channel!`);

  if (status.votes.size < Number(process.env.MIN_VOTES)) {
    return; // Do not show until we reach min votes
  }

  for (const socket of status.sockets.values()) {
    socket.emit('vote_update', {
      vote: status.vote,
    });
  }
}

chatClient.onMessage((channel, user, text, message) => {
  channel = channel.slice(1); // Remove the '#' prefix

  // Commands
  switch (text.toLowerCase()) {
    case '!resetvote':
      if (!message.userInfo.isBroadcaster && !message.userInfo.isMod) return;
      resetVote(user, channel).then();
      return;
  }

  handleMessage(channel, user, text).then();
});

io.use((socket, next) => {
  const channel = socket.handshake.query.channel as string | undefined;
  if (!channel) {
    socket.disconnect();
    next(new Error('No channel specified!'));
    return;
  }
  if (!channels.includes(channel)) {
    socket.disconnect();
    next(new Error('Unknown channel name!'));
    return;
  }
  next();
});

io.on('connection', (socket) => {
  console.log(`New socket connection: ${socket.handshake.address} id: ${socket.id}`);

  const channel = socket.handshake.query.channel as string;
  const status = channelStatusManager.getOrCreateStatus(channel);

  socket.on('disconnect', () => {
    console.log(`Removing socket connection: ${socket.handshake.address} id: ${socket.id}`);

    status.sockets.delete(socket.id);
  });
  status.sockets.set(socket.id, socket);

  if (!status.vote || !status.lastVoteAt) {
    return;
  }
  if (Date.now() - status.lastVoteAt >= Number(process.env.VOTE_TTL)) {
    return;
  }

  socket.emit('vote_update', {
    vote: status.vote,
  });
});

app.locals.basePath = process.env.HTTP_PATH || '';
app.locals.voteTtl = Number(process.env.VOTE_TTL);
app.set('views', 'views');
app.set('view engine', 'mustache');
app.engine('mustache', mustacheExpress());

app.use(process.env.HTTP_PATH || '/', router);
router.get('/:channel', (request, response) => {
  const channel = request.params.channel;
  if (!channels.includes(channel)) {
    response.status(404);
    response.send(`Channel '${channel}' not found!`);
    return;
  }
  response.render('index', {
    channel: request.params.channel,
  });
});
router.use(express.static('public'));

server.listen(Number(process.env.HTTP_PORT), () => {
  console.log('Listening on port ' + process.env.HTTP_PORT + ' and path ' + process.env.HTTP_PATH);
});
