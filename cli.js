#!/usr/bin/env iojs
'use strict';

const program = require('commander');
const fetch = require('node-fetch');
const apiKey = require('fs').readFileSync(process.env.HOME + '/.ftapi_v2', { encoding: 'utf8' });
const flatten = require('flatten');

const fetchCapiV2 = function(url) {
	return fetch(url, { headers: { 'X-Api-Key': apiKey }, timeout: 3000 })
		.then(function(response) {
			if (response.ok) {
				return response.json();
			}
			throw new Error("Bad response from CAPI v2 for url: " + url);
		});
}

const fetchImage = function (url, contentUri) {
    return fetch(url, {
        method: 'POST',
        timeout: 3000,
        body: '{ "contentUri" : "http://methode-image-model-transformer-iw-uk-p.svc.ft.com/' + contentUri + '" }',
        headers: {
            'Content-Type': 'application/json'
        }
    })
}

function republishImageSet(url) {
	return fetchCapiV2(url)
		.catch(function(err) {
			console.log("The imageSet doesn't exist in the Content API so I probably can't fix this. Contact UPPPP");
			throw err;
		})
		.then(function(imageSet) {
            const imageUpdates = imageSet.members.map(function (image) {
                const imageId = image.id.replace('http://api.ft.com/content/', '');
                return [
                	fetchImage('http://binary-ingester-iw-uk-p.svc.ft.com/ingest', 'image/model/' + imageId)
	                    .then(function(response) {
	                        if (!response.ok) {
	                            throw new Error("Unable to republish image");
	                        }
	                        console.log("Successfully republished image '" + imageId + "'");
	                    }),
                	fetchImage('http://semantic-ingester-pr-uk-p.svc.ft.com/ingest', 'image/model/' + imageId)
	                    .then(function(response) {
	                        if (!response.ok) {
	                    		console.log('ERROR')
	                            throw new Error("Unable to refeed image '" + imageId + "'");
	                        }
	                        console.log("Successfully refed image '" + imageId + "'");
	                    })
                ];
            });
            const imageSetId = imageSet.id.replace('http://www.ft.com/thing/', '');
            imageUpdates.push(
            	fetchImage('http://semantic-ingester-pr-uk-p.svc.ft.com/ingest', 'image-set/model/' + imageSetId)
	                .then(function(response) {
	                    if (!response.ok) {
	                        throw new Error("Unable to refeed image set '" + imageSetId + "'");
	                    }
	                    console.log("Successfully refed image set '" + imageSetId + "'");
	                })
            );
			return Promise.all(flatten(imageUpdates));
		});
}

program
	.version('1.0.0')
	.command('article [uuid]')
	.description('Fix the images within the specified uuid')
	.action(function(uuid) {
		fetchCapiV2('http://api.ft.com/content/' + uuid)
			.then(function(article) {
				const imageIds = article.bodyXML.match(/ImageSet" url="http:\/\/api\.ft\.com\/content\/([a-z-0-9]{3,})"/g)
					.map(function(snippet) {
						return snippet.replace(/ImageSet" url="(http:\/\/api\.ft\.com\/content\/[a-z-0-9]{3,})"/, "$1");
					});
				if (article.mainImage.id && imageIds.indexOf(article.mainImage.id) === -1) {
					imageIds.push(article.mainImage.id);
				}
				let promises = imageIds.map(function(url) {
					console.log('inline image', url);
					return republishImageSet(url);
				});
				return Promise.all(promises);
			}, function(err) {
				console.log("This article doesn't seem to exist…");
				throw err;
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
