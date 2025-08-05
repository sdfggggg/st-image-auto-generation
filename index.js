// The main script for the extension

import { extension_settings, getContext } from "../../../extensions.js";
import { saveSettingsDebounced, eventSource, event_types, updateMessageBlock, createNewMessage, appendMediaToMessage } from "../../../../script.js";
import { regexFromString } from '../../../utils.js';
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

const extensionName = "st-image-auto-generation";
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

const INSERT_TYPE = {
    DISABLED: 'disabled',
    INLINE: 'inline',
    NEW_MESSAGE: 'new', // Note: This type wasn't fully implemented in the original logic, I've left it to behave like inline for now.
    REPLACE: 'replace'
};

const defaultSettings = {
    insertType: INSERT_TYPE.DISABLED,
    promptInjection: {
        enabled: true,
        prompt: `<image_generation>\nYou must insert a <pic prompt="example prompt"> at end of the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.\n</image_generation>`,
        regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
        position: 'deep_system',
        depth: 0,
    },
    backendType: 'default',
    stdApi: {
        sq: '',
        naiKey: '',
        model: 'nai-diffusion-3',
        artist: '',
        size: '竖图',
        scale: '5',
        steps: '23',
        cfgRescale: '0',
        sampler: 'k_euler_ancestral',
        noiseSchedule: 'native',
        useCache: true,
    },
};

// **FIXED**: Added the missing loadSettings function
function loadSettings() {
    // Deep merge of default and saved settings
    const settings = Object.assign({}, defaultSettings, extension_settings[extensionName]);
    settings.promptInjection = Object.assign({}, defaultSettings.promptInjection, settings.promptInjection);
    settings.stdApi = Object.assign({}, defaultSettings.stdApi, settings.stdApi);
    extension_settings[extensionName] = settings;
}

function updateUI() {
    const settings = extension_settings[extensionName];
    if (!settings) return;

    $("#auto_generation").toggleClass('selected', settings.insertType !== INSERT_TYPE.DISABLED);

    if ($("#image_generation_insert_type").length) {
        $('#image_generation_insert_type').val(settings.insertType);
        $('#prompt_injection_enabled').prop('checked', settings.promptInjection.enabled);
        $('#prompt_injection_text').val(settings.promptInjection.prompt);
        $('#prompt_injection_regex').val(settings.promptInjection.regex);
        $('#prompt_injection_position').val(settings.promptInjection.position);
        $('#prompt_injection_depth').val(settings.promptInjection.depth);

        $('#image_backend_type').val(settings.backendType || 'default');
        const isStdApi = settings.backendType === 'stdapi';
        $('#std_api_settings').toggle(isStdApi);

        if (settings.stdApi) {
            $('#std_api_key').val(settings.stdApi.sq || '');
            $('#std_nai_key').val(settings.stdApi.naiKey || '');
            $('#std_api_model').val(settings.stdApi.model || 'nai-diffusion-3');
            $('#std_api_artist').val(settings.stdApi.artist || '');
            $('#std_api_size').val(settings.stdApi.size || '竖图');
            $('#std_api_scale').val(settings.stdApi.scale || '5');
            $('#std_api_steps').val(settings.stdApi.steps || '23');
            $('#std_api_cfg_rescale').val(settings.stdApi.cfgRescale || '0');
            $('#std_api_sampler').val(settings.stdApi.sampler || 'k_euler');
            $('#std_api_noise_schedule').val(settings.stdApi.noiseSchedule || 'native');
            $('#std_api_use_cache').prop('checked', settings.stdApi.useCache !== false);
        }
    }
}

async function createSettings(settingsHtml) {
    $("#extensions_settings").append(settingsHtml);
    addEventListeners();
    updateUI();
}

function addEventListeners() {
    const settings = extension_settings[extensionName];

    $('#image_generation_insert_type').on('change', function () {
        settings.insertType = $(this).val();
        updateUI();
        saveSettingsDebounced();
    });

    $('#prompt_injection_enabled').on('change', function () {
        settings.promptInjection.enabled = $(this).is(':checked');
        saveSettingsDebounced();
    });

    $('#prompt_injection_text').on('input', function () {
        settings.promptInjection.prompt = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_regex').on('input', function () {
        settings.promptInjection.regex = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_position').on('change', function () {
        settings.promptInjection.position = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_depth').on('input', function () {
        settings.promptInjection.depth = parseInt($(this).val()) || 0;
        saveSettingsDebounced();
    });

    $('#image_backend_type').on('change', function () {
        settings.backendType = $(this).val();
        $('#std_api_settings').toggle($(this).val() === 'stdapi');
        saveSettingsDebounced();
    });

    // STD API Settings
    const stdApiSettings = settings.stdApi;
    $('#std_api_key').on('input', function () { stdApiSettings.sq = $(this).val(); saveSettingsDebounced(); });
    $('#std_nai_key').on('input', function () { stdApiSettings.naiKey = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_model').on('change', function () { stdApiSettings.model = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_artist').on('input', function () { stdApiSettings.artist = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_size').on('change', function () { stdApiSettings.size = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_scale').on('input', function () { stdApiSettings.scale = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_steps').on('input', function () { stdApiSettings.steps = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_cfg_rescale').on('input', function () { stdApiSettings.cfgRescale = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_sampler').on('change', function () { stdApiSettings.sampler = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_noise_schedule').on('change', function () { stdApiSettings.noiseSchedule = $(this).val(); saveSettingsDebounced(); });
    $('#std_api_use_cache').on('change', function () { stdApiSettings.useCache = $(this).is(':checked'); saveSettingsDebounced(); });

    $('#test_std_api').on('click', testStdApiGeneration);
}

function getMesRole() {
    const position = extension_settings[extensionName]?.promptInjection?.position || 'system';
    switch (position) {
        case 'deep_user': return 'user';
        case 'deep_assistant': return 'assistant';
        case 'deep_system':
        default:
            return 'system';
    }
}

eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, (eventData) => {
    const settings = extension_settings[extensionName];
    if (!settings?.promptInjection?.enabled || settings.insertType === INSERT_TYPE.DISABLED) {
        return;
    }

    const { prompt, depth, position } = settings.promptInjection;
    const role = getMesRole();
    const message = { role, content: prompt };

    if (depth === 0) {
        eventData.chat.push(message);
    } else {
        eventData.chat.splice(-depth, 0, message);
    }
});

async function handleIncomingMessage() {
    const settings = extension_settings[extensionName];
    if (!settings || settings.insertType === INSERT_TYPE.DISABLED) {
        return;
    }

    const context = getContext();
    const message = context.chat[context.chat.length - 1];

    if (!message || message.is_user || !message.mes) {
        return;
    }

    const imgTagRegex = regexFromString(settings.promptInjection.regex);
    const fullMatches = [...message.mes.matchAll(imgTagRegex)]; // Gets both full tag and capture group

    if (fullMatches.length === 0) {
        return;
    }

    setTimeout(async () => {
        try {
            toastr.info(`Generating ${fullMatches.length} image(s)...`);
            const { insertType, backendType } = settings;
            const messageElement = $(`.mes[mesid="${context.chat.length - 1}"]`);

            for (const match of fullMatches) {
                const fullTag = match[0]; // The entire <pic> tag
                const prompt = match[1]; // The prompt inside "..."
                let imageUrl;

                if (backendType === 'stdapi') {
                    imageUrl = await generateImageWithStdApi(prompt, ""); // Add negative prompt if needed
                } else {
                    imageUrl = await SlashCommandParser.commands['sd'].callback(prompt, { quiet: true });
                }

                if (typeof imageUrl !== 'string' || imageUrl.trim().length === 0) {
                    console.warn(`[${extensionName}] Failed to generate or got empty URL for prompt: ${prompt}`);
                    continue;
                }

                if (insertType === INSERT_TYPE.INLINE) {
                    if (!message.extra) message.extra = {};
                    if (!Array.isArray(message.extra.image_swipes)) message.extra.image_swipes = [];
                    
                    message.extra.image_swipes.push(imageUrl);
                    message.extra.image = imageUrl;
                    message.extra.title = prompt;
                    message.extra.inline_image = true;
                    appendMediaToMessage(message, messageElement);
                } 
                else if (insertType === INSERT_TYPE.REPLACE) {
                    const newImageTag = `<img src="${imageUrl}" title="${prompt}" alt="${prompt}" class="inline-image">`;
                    message.mes = message.mes.replace(fullTag, newImageTag);
                }
            }

            if (insertType === INSERT_TYPE.REPLACE) {
                updateMessageBlock(context.chat.length - 1, message);
            }
            
            await context.saveChat();
            toastr.success(`${fullMatches.length} image(s) processed successfully.`);
        } catch (error) {
            toastr.error(`Image generation error: ${error.message}`);
            console.error(`[${extensionName}] Image generation error:`, error);
        }
    }, 100);
}

// **FIXED**: Refactored to use fetch and async/await
async function generateImageWithStdApi(prompt, negativePrompt = '') {
    const stdApiSettings = extension_settings[extensionName]?.stdApi;
    if (!stdApiSettings) {
        throw new Error('STD API settings are not configured.');
    }
    if (!stdApiSettings.sq) {
        throw new Error('STD API Authorization Key (授权Key) is missing.');
    }

    const apiUrl = new URL('https://std.loliy.top/generate');
    const params = {
        sq: stdApiSettings.sq,
        'nai-key': stdApiSettings.naiKey,
        model: stdApiSettings.model,
        artist: stdApiSettings.artist,
        tag: prompt,
        negative: negativePrompt, // You might want to combine this with a global negative prompt
        size: stdApiSettings.size,
        scale: stdApiSettings.scale,
        steps: stdApiSettings.steps,
        cfg_rescale: stdApiSettings.cfgRescale,
        sampler: stdApiSettings.sampler,
        noise_schedule: stdApiSettings.noiseSchedule,
    };
    if (!stdApiSettings.useCache) {
        params.nocache = '1';
    }

    Object.keys(params).forEach(key => {
        if (params[key] != null && params[key] !== '') {
            apiUrl.searchParams.append(key, params[key]);
        }
    });

    const response = await fetch(apiUrl.toString());
    if (!response.ok) {
        throw new Error(`STD API request failed: ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function testStdApiGeneration() {
    toastr.info('Testing STD API image generation...');
    try {
        const testPrompt = "a beautiful landscape, masterpiece, best quality";
        const imageUrl = await generateImageWithStdApi(testPrompt);

        if (imageUrl) {
            const popupId = 'std-test-popup';
            $(`#${popupId}`).remove(); // Remove previous popup if exists

            const $popup = $(`<div id="${popupId}" class="std_test_popup" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #282c34; padding: 20px; border-radius: 10px; z-index: 10001; box-shadow: 0 5px 25px rgba(0,0,0,0.5);"></div>`);
            const $img = $(`<img src="${imageUrl}" style="max-width: 80vw; max-height: 80vh; display: block; margin-bottom: 15px;" />`);
            const $closeBtn = $('<button class="menu_button danger_button">Close</button>');
            
            $popup.append($img).append($closeBtn);
            $('body').append($popup);
            
            $closeBtn.on('click', () => $popup.remove());
            toastr.success('STD API Test Successful!');
        }
    } catch (error) {
        console.error('STD API Test Error:', error);
        toastr.error(`STD API Test Failed: ${error.message}`);
    }
}

$(async function () {
    const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);
    
    // The menu button that opens the settings panel has been removed from this version
    // as it's better to manage settings directly from the Extensions panel.
    
    loadSettings();
    await createSettings(settingsHtml);
    eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
});

// **FIXED**: Removed the duplicated, misplaced code block from the end of the file.