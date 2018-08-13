const assert = require('assert'),
	bole = require('bole'),
	logstring = require('common-log-string'),
	makeReceiver = require('npm-hook-receiver'),
	slack = require('@slack/client')

const logger = bole(process.env.SERVICE_NAME || 'hooks-bot')
bole.output({ level: 'info', stream: process.stdout });

const token = process.env.SLACK_API_TOKEN || ''
assert(token, 'you must supply a slack api token in process.env.SLACK_API_TOKEN');
const channelID = process.env.SLACK_CHANNEL
assert(channelID, 'you must supply a slack channel ID in process.env.SLACK_CHANNEL');
const port = process.env.PORT || '6666'

// This is how we post to slack.
const web = new slack.WebClient(token)

// Make a webhooks receiver and have it act on interesting events.
// The receiver is a restify server!
const opts = {
	name: process.env.SERVICE_NAME || 'hooks-bot',
	secret: process.env.SHARED_SECRET,
	mount: process.env.MOUNT_POINT || '/incoming',
}
const server = makeReceiver(opts)

// All hook events, with special handling for some.
server.on('hook', function onIncomingHook(hook)
{
	const pkg = hook.name.replace('/', '%2F')
	const type = hook.type
	const change = hook.event.replace(type + ':', '')

	let message, highlightedVersion
	logger.info('hook', JSON.stringify(hook));

	switch (hook.event)
	{
	case 'package:publish':
		highlightedVersion = hook.change.version;
		message = `:package::sparkles: *published*`;
		break;

	case 'package:unpublish':
		highlightedVersion = hook.change.version;
		message = `:package::wave: *unpublished*`;
		break;

	case 'package:deprecated':
		highlightedVersion = hook.change.deprecated;
		message = `:package::skull_and_crossbones: *deprecated*`;
		break;

	default:
		return
	}

	const attachment = {
		fallback: `name: '${pkg}' | event: '${change}' | type: '${type}'`,
		text: `_${message}_`,
		color: '#cb3837',
		title: hook.name,
		title_link: `https://www.npmjs.com/package/${pkg}`,
		mrkdwn_in: ['text', 'pretext']
	}

	if (highlightedVersion) {
		attachment.author_name = `v${highlightedVersion}`;
		attachment.author_icon = `https://cdn.rawgit.com/npm/logos/373398ec73257954872124f3224ff90e62f2635c/npm%20square/n-large.png`;
	}

	web.chat.postMessage({
		channel: channelID,
		text: message,
		attachments: [attachment]
	});
});

server.on('hook:error', function(message)
{
	web.chat.postMessage({
		channel: channelID,
		text: '*error handling web hook:* ' + message
	});
});

// now make it ready for production

server.on('after', function logEachRequest(request, response, route, error)
{
	logger.info(logstring(request, response));
});

server.get('/ping', function handlePing(request, response, next)
{
	response.send(200, 'pong');
	next();
});

server.listen(port, function()
{
	logger.info('listening on ' + port);
});
