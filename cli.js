#!/usr/bin/env iojs
'use strict';

const program = require('commander');
const fetch = require('node-fetch');
const apiKey = require('fs').readFileSync(process.env.HOME + '/.ftapi_v2', { encoding: 'utf8' });

function fetchCapiV2(url) {
	return fetch(url, { headers: { 'X-Api-Key': apiKey }, timeout: 3000 })
		.then(function(response) {
			if (response.ok) {
				return response.json();
			}
			throw new Error("Bad response from CAPI v2 for url: " + url);
		});
}

function republishImageSet(url) {
	return fetchCapiV2(url)
		.then(function(imageSet) {
			return fetchCapiV2(imageSet.members[0].id)
				.then(function(image) {
					return fetch("http://binary-ingester-iw-uk-p.svc.ft.com/ingest", {
						method: 'POST',
						timeout: 3000,
						body: '{ "contentUri" : "http://methode-image-model-transformer-iw-uk-p.svc.ft.com/image/model/' + image.contentOrigin.originatingIdentifier + '" }',
						headers: {
							'Content-Type': 'application/json'
						}
					});
				});
		}, function(err) {
			console.log("The imageSet doesn't exist in the Content API so I probably can't fix this. Contact UPPPP");
			throw err;
		});
}

program
	.version('1.0.0')
	.command('article [uuid]')
	.description('Fix the images within the specified uuid')
	.action(function(uuid) {
		fetchCapiV2('http://api.ft.com/content/' + uuid)
			.then(function(article) {
				let promises = article.bodyXML.match(/ImageSet" url="http:\/\/api\.ft\.com\/content\/([a-z-0-9]{3,})"/g)
					.map(function(snippet) {
						return snippet.replace(/ImageSet" url="(http:\/\/api\.ft\.com\/content\/[a-z-0-9]{3,})"/, "$1");
					})
					.map(function(url) {
						console.log('inline image', url);
						return republishImageSet(url);
					});
				if (article.mainImage.id) {
					promises.push(republishImageSet(article.mainImage.id));
				}
				return Promise.all(promises);
			}, function(err) {
				console.log("This article doesn't seem to exist…");
				throw err;
			})
			.then(function(response) {
				if (!response.ok) {
					throw new Error("Unable to republish image");
				}
				console.log("Successfully republished images in " + url);
			})
			.catch(function(err) {
				console.log(err);
			});
	});

program
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp();
}
