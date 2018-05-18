// Copyright 2017 Google Inc.
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.


const functions = require('firebase-functions');

const Speech = require('@google-cloud/speech');
const speech = new Speech.SpeechClient({keyFilename: "service-account-credentials.json"});

const Translate = require('@google-cloud/translate');
const translate = new Translate({keyFilename: "service-account-credentials.json"});

const Firestore = require('@google-cloud/firestore');
const db = new Firestore();

const getLanguageWithoutLocale = require("./utils").getLanguageWithoutLocale;

exports.onUploadFS = functions.firestore
    .document("/uploads/{uploadId}")
    .onCreate((change, context) => {
        let data = change.data();
        let language = data.language ? data.language : "en-US";

        let request = {
                'config': {
                'languageCode': language,
                'sampleRateHertz': 16000,
                'encoding': "LINEAR16"
            },
                'audio': { 
                'uri': `gs://babel-fire.appspot.com/${data.fullPath}`
            }
        };

        return speech.recognize(request).then((response) => {
            let transcript = response[0].results[0].alternatives[0].transcript;
            return db.collection("transcripts").doc(context.params.uploadId).set({text: transcript, language: language});
        });
    });

exports.onTranscriptFS = functions.firestore
    .document("/transcripts/{transcriptId}")
    .onCreate((change, context) => {
        let value = change.data();
        let transcriptId = context.params.transcriptId || "default";
        let text = value.text ? value.text : value;
        let timestamp = new Date();
        let tempMap = {timestamp: timestamp};

        const languages = ["en", "es", "no", "de", "sv", "da", "fr"];
        const from = value.language ? getLanguageWithoutLocale(value.language) : "en";

        let promises = languages.map(to => {
            if (from == to) {
                tempMap[to] = {"text": text, "language": from};
                return Promise.resolve();
            } else {
                // Call the Google Cloud Platform Translate API
                return translate.translate(text, {
                    from,
                    to
                }).then(result => {
                    let translation = result[0];
                    console.log(`Translation from ${from} to ${to} is ${translation} for id ${transcriptId}`);
                    tempMap[to] = {"text": translation, "language": to};
                    return Promise.resolve();
                });
            }
        });
        
        return Promise.all(promises).then(() => {
            return db.collection("translations").doc(transcriptId).set(tempMap);
        });
    });