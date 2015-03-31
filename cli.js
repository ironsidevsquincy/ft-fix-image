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

function republishImage(uuid) {
	return Promise.all([
	    	fetchImage('http://binary-ingester-iw-uk-p.svc.ft.com/ingest', 'image/model/' + uuid)
	            .then(function(response) {
	                if (!response.ok) {
	                    throw new Error("Unable to republish image");
	                }
	                console.log("Successfully republished image '" + uuid + "'");
	            }),
	    	fetchImage('http://semantic-ingester-pr-uk-p.svc.ft.com/ingest', 'image/model/' + uuid)
	            .then(function(response) {
	                if (!response.ok) {
	                    throw new Error("Unable to refeed image '" + uuid + "'");
	                }
	                console.log("Successfully refed image '" + uuid + "'");
	            })
	    ])
		.catch(function (err) {
			console.log(err)
		});
}

function republishImageSet(uuid) {
	return fetchImage('http://semantic-ingester-pr-uk-p.svc.ft.com/ingest', 'image-set/model/' + uuid)
        .then(function(response) {
            if (!response.ok) {
                throw new Error("Unable to refeed image set '" + uuid + "'");
            }
            console.log("Successfully refed image set '" + uuid + "'");
        })
        .then(function () {
        	return fetchCapiV2('http://api.ft.com/content/' + uuid)
        })
		.then(function(imageSet) {
            const imageUpdates = imageSet.members.map(function (image) {
                return republishImage(image.id.replace('http://api.ft.com/content/', ''));
            });
			return Promise.all(imageUpdates);
		})
		.catch(function (err) {
			console.log(err)
		});
}

function republishArticle(uuid) {
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
				const imageSetId = url.replace('http://api.ft.com/content/', '');
				return republishImageSet(imageSetId);
			});
			return Promise.all(promises);
		})
		.catch(function(err) {
			console.log(err);
		})
}

program
	.version('1.0.0')
	.command('article [uuid]')
	.description('Fix the images within the specified uuid')
	.action(function(uuid) {
		republishArticle(uuid);
	});

program
	.command('image-set [uuid]')
	.description('Fix an image set and its images')
	.action(function(uuid) {
		republishImageSet(uuid);
	});

program
	.command('image [uuid]')
	.description('Fix a media resource metadata and image')
	.action(function(uuid) {
		republishImage(uuid);
	});

program
	.parse(process.argv);

if (!process.argv.slice(2).length) {
	program.outputHelp();
}
