// The main script for the extension
// The following are examples of some basic extension functionality

//You'll likely need to import extension_settings, getContext, and loadExtensionSettings from extensions.js
import { extension_settings, getContext } from "../../../extensions.js";
//You'll likely need to import some other functions from the main script
import { saveSettingsDebounced, eventSource, event_types, updateMessageBlock } from "../../../../script.js";
import { appendMediaToMessage } from "../../../../script.js";
import { regexFromString } from '../../../utils.js';
import { SlashCommandParser } from "../../../slash-commands/SlashCommandParser.js";

// 扩展名称和路径
const extensionName = "st-image-auto-generation";
// /scripts/extensions/third-party
const extensionFolderPath = `/scripts/extensions/third-party/${extensionName}`;

// 插入类型常量
const INSERT_TYPE = {
    DISABLED: 'disabled',
    INLINE: 'inline',
    NEW_MESSAGE: 'new',
    REPLACE: 'replace'
};

// 默认设置
const defaultSettings = {
    insertType: INSERT_TYPE.DISABLED,
    promptInjection: {
        enabled: true,
        prompt:
            `<image_generation>
You must insert a <pic prompt="example prompt"> at end of the reply. Prompts are used for stable diffusion image generation, based on the plot and character to output appropriate prompts to generate captivating images.
</image_generation>`,
        regex: '/<pic[^>]*\\sprompt="([^"]*)"[^>]*?>/g',
        position: 'deep_system', // deep_system, deep_user, deep_assistant
        depth: 0 // 0表示添加到末尾，>0表示从末尾往前数第几个位置
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
        sampler: 'k_euler',
        noiseSchedule: 'native',
        useCache: true
    }
};

// 从设置更新UI
function updateUI() {
    // 根据insertType设置开关状态
    $("#auto_generation").toggleClass('selected', extension_settings[extensionName].insertType !== INSERT_TYPE.DISABLED);

    // 只在表单元素存在时更新它们
    if ($("#image_generation_insert_type").length) {
        $('#image_generation_insert_type').val(extension_settings[extensionName].insertType);
        $('#prompt_injection_enabled').prop('checked', extension_settings[extensionName].promptInjection.enabled);
        $('#prompt_injection_text').val(extension_settings[extensionName].promptInjection.prompt);
        $('#prompt_injection_regex').val(extension_settings[extensionName].promptInjection.regex);
        $('#prompt_injection_position').val(extension_settings[extensionName].promptInjection.position);
        $('#prompt_injection_depth').val(extension_settings[extensionName].promptInjection.depth);
        
        // 新增：backend类型设置
        $('#image_backend_type').val(extension_settings[extensionName].backendType || 'default');
        
        // STD API 设置显示/隐藏
        const isStdApi = extension_settings[extensionName].backendType === 'stdapi';
        $('#std_api_settings').toggle(isStdApi);
        
        // 如果是STD API，则更新STD API的设置项
        if (isStdApi && extension_settings[extensionName].stdApi) {
            $('#std_api_key').val(extension_settings[extensionName].stdApi.sq || '');
            $('#std_nai_key').val(extension_settings[extensionName].stdApi.naiKey || '');
            $('#std_api_model').val(extension_settings[extensionName].stdApi.model || 'nai-diffusion-3');
            $('#std_api_artist').val(extension_settings[extensionName].stdApi.artist || '');
            $('#std_api_size').val(extension_settings[extensionName].stdApi.size || '竖图');
            $('#std_api_scale').val(extension_settings[extensionName].stdApi.scale || '5');
            $('#std_api_steps').val(extension_settings[extensionName].stdApi.steps || '23');
            $('#std_api_cfg_rescale').val(extension_settings[extensionName].stdApi.cfgRescale || '0');
            $('#std_api_sampler').val(extension_settings[extensionName].stdApi.sampler || 'k_euler');
            $('#std_api_noise_schedule').val(extension_settings[extensionName].stdApi.noiseSchedule || 'native');
            $('#std_api_use_cache').prop('checked', extension_settings[extensionName].stdApi.useCache !== false);
        }
    }
}
// 创建设置页面
async function createSettings(settingsHtml) {
    // 创建一个容器来存放设置，确保其正确显示在扩展设置面板中
    if (!$("#image_auto_generation_container").length) {
        $("#extensions_settings2").append('<div id="image_auto_generation_container" class="extension_container"></div>');
    }

    // 使用传入的settingsHtml而不是重新获取
    $("#image_auto_generation_container").empty().append(settingsHtml);

    // 添加设置变更事件处理
    $('#image_generation_insert_type').on('change', function () {
        const newValue = $(this).val();
        extension_settings[extensionName].insertType = newValue;
        updateUI();
        saveSettingsDebounced();
    });

    // 添加提示词注入设置的事件处理
    $('#prompt_injection_enabled').on('change', function () {
        extension_settings[extensionName].promptInjection.enabled = $(this).prop('checked');
        saveSettingsDebounced();
    });

    $('#prompt_injection_text').on('input', function () {
        extension_settings[extensionName].promptInjection.prompt = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_regex').on('input', function () {
        extension_settings[extensionName].promptInjection.regex = $(this).val();
        saveSettingsDebounced();
    });

    $('#prompt_injection_position').on('change', function () {
        extension_settings[extensionName].promptInjection.position = $(this).val();
        saveSettingsDebounced();
    });

    // 深度设置事件处理
    $('#prompt_injection_depth').on('input', function () {
        const value = parseInt(String($(this).val()));
        extension_settings[extensionName].promptInjection.depth = isNaN(value) ? 0 : value;
        saveSettingsDebounced();
    });
// 添加到createSettings函数中，放在"初始化设置值"之前
// 添加backend类型选择事件处理
$('#image_backend_type').on('change', function() {
    extension_settings[extensionName].backendType = $(this).val();
    // 显示/隐藏STD API设置
    $('#std_api_settings').toggle($(this).val() === 'stdapi');
    saveSettingsDebounced();
});

// STD API 设置项的事件处理
$('#std_api_key').on('input', function() {
    extension_settings[extensionName].stdApi.sq = $(this).val();
    saveSettingsDebounced();
});

$('#std_nai_key').on('input', function() {
    extension_settings[extensionName].stdApi.naiKey = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_model').on('change', function() {
    extension_settings[extensionName].stdApi.model = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_artist').on('input', function() {
    extension_settings[extensionName].stdApi.artist = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_size').on('change', function() {
    extension_settings[extensionName].stdApi.size = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_scale').on('input', function() {
    extension_settings[extensionName].stdApi.scale = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_steps').on('input', function() {
    extension_settings[extensionName].stdApi.steps = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_cfg_rescale').on('input', function() {
    extension_settings[extensionName].stdApi.cfgRescale = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_sampler').on('change', function() {
    extension_settings[extensionName].stdApi.sampler = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_noise_schedule').on('change', function() {
    extension_settings[extensionName].stdApi.noiseSchedule = $(this).val();
    saveSettingsDebounced();
});

$('#std_api_use_cache').on('change', function() {
    extension_settings[extensionName].stdApi.useCache = $(this).prop('checked');
    saveSettingsDebounced();
});

// 添加测试按钮的事件处理
$('#test_std_api').on('click', function() {
    testStdApiGeneration();
});
    // 初始化设置值
    updateUI();
}

// 设置变更处理函数
function onExtensionButtonClick() {
    // 直接访问扩展设置面板
    const extensionsDrawer = $('#extensions-settings-button .drawer-toggle');

    // 如果抽屉是关闭的，点击打开它
    if ($('#rm_extensions_block').hasClass('closedDrawer')) {
        extensionsDrawer.trigger('click');
    }

    // 等待抽屉打开后滚动到我们的设置容器
    setTimeout(() => {
        // 找到我们的设置容器
        const container = $('#image_auto_generation_container');
        if (container.length) {
            // 滚动到设置面板位置
            $('#rm_extensions_block').animate({
                scrollTop: container.offset().top - $('#rm_extensions_block').offset().top + $('#rm_extensions_block').scrollTop()
            }, 500);

            // 使用SillyTavern原生的抽屉展开方式
            // 检查抽屉内容是否可见
            const drawerContent = container.find('.inline-drawer-content');
            const drawerHeader = container.find('.inline-drawer-header');

            // 只有当内容被隐藏时才触发展开
            if (drawerContent.is(':hidden') && drawerHeader.length) {
                // 直接使用原生点击事件触发，而不做任何内部处理
                drawerHeader.trigger('click');
            }
        }
    }, 500);
}

// 初始化扩展
$(function () {
    (async function () {
        // 获取设置HTML (只获取一次)
        const settingsHtml = await $.get(`${extensionFolderPath}/settings.html`);

        // 添加扩展到菜单
        $("#extensionsMenu").append(`<div id="auto_generation" class="list-group-item flex-container flexGap5">
            <div class="fa-solid fa-robot"></div>
            <span data-i18n="Image Auto Generation">Image Auto Generation</span>
        </div>`);

        // 修改点击事件，打开设置面板而不是切换状态
        $("#auto_generation").off('click').on("click", onExtensionButtonClick);

        await loadSettings();

        // 创建设置 - 将获取的HTML传递给createSettings
        await createSettings(settingsHtml);

        // 确保设置面板可见时，设置值是正确的
        $('#extensions-settings-button').on('click', function () {
            setTimeout(() => {
                updateUI();
            }, 200);
        });
    })();
});
// 获取消息角色
function getMesRole() {
    // 确保对象路径存在
    if (!extension_settings[extensionName] ||
        !extension_settings[extensionName].promptInjection ||
        !extension_settings[extensionName].promptInjection.position) {
        return 'system'; // 默认返回system角色
    }

    switch (extension_settings[extensionName].promptInjection.position) {
        case 'deep_system':
            return 'system';
        case 'deep_user':
            return 'user';
        case 'deep_assistant':
            return 'assistant';
        default:
            return 'system';
    }
}

// 监听CHAT_COMPLETION_PROMPT_READY事件以注入提示词
eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async function (eventData) {
    try {
        // 确保设置对象和promptInjection对象都存在
        if (!extension_settings[extensionName] ||
            !extension_settings[extensionName].promptInjection ||
            !extension_settings[extensionName].promptInjection.enabled ||
            extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED) {
            return;
        }

        const prompt = extension_settings[extensionName].promptInjection.prompt;
        const depth = extension_settings[extensionName].promptInjection.depth || 0;
        const role = getMesRole();

        console.log(`[${extensionName}] 准备注入提示词: 角色=${role}, 深度=${depth}`);
        console.log(`[${extensionName}] 提示词内容: ${prompt.substring(0, 50)}...`);

        // 根据depth参数决定插入位置
        if (depth === 0) {
            // 添加到末尾
            eventData.chat.push({ role: role, content: prompt });
            console.log(`[${extensionName}] 提示词已添加到聊天末尾`);
        } else {
            // 从末尾向前插入
            eventData.chat.splice(-depth, 0, { role: role, content: prompt });
            console.log(`[${extensionName}] 提示词已插入到聊天中，从末尾往前第 ${depth} 个位置`);
        }

    } catch (error) {
        console.error(`[${extensionName}] 提示词注入错误:`, error);
        toastr.error(`提示词注入错误: ${error}`);
    }
});

// 监听消息接收事件
eventSource.on(event_types.MESSAGE_RECEIVED, handleIncomingMessage);
async function handleIncomingMessage() {
    // 确保设置对象存在
    if (!extension_settings[extensionName] ||
        extension_settings[extensionName].insertType === INSERT_TYPE.DISABLED) {
        return;
    }

    const context = getContext();
    const message = context.chat[context.chat.length - 1];

    // 检查是否是AI消息
    if (!message || message.is_user) {
        return;
    }

    // 确保promptInjection对象和regex属性存在
    if (!extension_settings[extensionName].promptInjection ||
        !extension_settings[extensionName].promptInjection.regex) {
        console.error('Prompt injection settings not properly initialized');
        return;
    }

    // 使用正则表达式search
    const imgTagRegex = regexFromString(extension_settings[extensionName].promptInjection.regex);
    // const testRegex = regexFromString(extension_settings[extensionName].promptInjection.regex);
    let matches = imgTagRegex.global ? [...message.mes.matchAll(imgTagRegex)].map(match => match[1]) : [message.mes.match(imgTagRegex)[1]]; // 只取捕获组的内容
    console.log(imgTagRegex, matches)
    if (matches.length > 0) {
        // 延迟执行图片生成，确保消息首先显示出来
        setTimeout(async () => {
            try {
                toastr.info(`Generating ${matches.length} images...`);
                const insertType = extension_settings[extensionName].insertType;


                // 在当前消息中插入图片
                // 初始化message.extra
                if (!message.extra) {
                    message.extra = {};
                }

                // 初始化image_swipes数组
                if (!Array.isArray(message.extra.image_swipes)) {
                    message.extra.image_swipes = [];
                }

                // 如果已有图片，添加到swipes
                if (message.extra.image && !message.extra.image_swipes.includes(message.extra.image)) {
                    message.extra.image_swipes.push(message.extra.image);
                }

                // 获取消息元素用于稍后更新
                const messageElement = $(`.mes[mesid="${context.chat.length - 1}"]`);

                // 处理每个匹配的图片标签
                for (let i = 0; i < matches.length; i++) {
                    const prompt = matches[i];

                    // @ts-ignore
                    const result = await SlashCommandParser.commands['sd'].callback({ quiet: insertType === INSERT_TYPE.NEW_MESSAGE ? 'false' : 'true' }, prompt);
                    // 统一插入到extra里
                    if (insertType === INSERT_TYPE.INLINE) {
                        let imageUrl = result;
                        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                            // 添加图片到swipes数组
                            message.extra.image_swipes.push(imageUrl);

                            // 设置第一张图片为主图片，或更新为最新生成的图片
                            message.extra.image = imageUrl;
                            message.extra.title = prompt;
                            message.extra.inline_image = true;

                            // 更新UI
                            appendMediaToMessage(message, messageElement);

                            // 保存聊天记录
                            await context.saveChat();
                        }
                    } else if (insertType === INSERT_TYPE.REPLACE) {
                        let imageUrl = result;
                        if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                            // Find the original image tag in the message
                            const originalTag = message.mes.match(imgTagRegex)[0];
                            // Replace it with an actual image tag
                            const newImageTag = `<img src="${imageUrl}" title="${prompt}" alt="${prompt}">`;
                            message.mes = message.mes.replace(originalTag, newImageTag);

                            // Update the message display using updateMessageBlock
                            updateMessageBlock(context.chat.length - 1, message);

                            // Save the chat
                            await context.saveChat();
                        }
                    }

                }
                toastr.success(`${matches.length} images generated successfully`);
            } catch (error) {
                toastr.error(`Image generation error: ${error}`);
                console.error('Image generation error:', error);
            }
        }, 0); //防阻塞UI渲染
    }
}

// 测试STD API图像生成
async function testStdApiGeneration() {
    toastr.info('正在测试STD API图像生成...');
    
    try {
        // 获取一个简单的测试提示词
        const testPrompt = "a beautiful landscape, masterpiece, best quality";
        
        // 生成图像
        const imageUrl = await generateImageWithStdApi(testPrompt);
        
        if (imageUrl) {
            // 创建一个临时的对话框显示生成的图片
            const $popup = $('<div class="std_test_popup" style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #222; padding: 20px; border-radius: 10px; z-index: 10000; box-shadow: 0 0 20px rgba(0,0,0,0.7);"></div>');
            const $img = $(`<img src="${imageUrl}" style="max-width: 80vw; max-height: 80vh;" />`);
            const $closeBtn = $('<button style="background: #f44; border: none; color: white; padding: 5px 10px; border-radius: 5px; margin-top: 10px; cursor: pointer;">关闭</button>');
            
            $popup.append($img);
            $popup.append('<br>');
            $popup.append($closeBtn);
            $('body').append($popup);
            
            $closeBtn.on('click', function() {
                $popup.remove();
            });
            
            toastr.success('STD API测试成功！');
        }
    } catch (error) {
        console.error('STD API测试错误:', error);
        toastr.error(`STD API测试失败: ${error.message}`);
    }
}

// 使用STD API生成图像
async function generateImageWithStdApi(prompt, negativePrompt = '') {
    // 确保STD API设置存在
    if (!extension_settings[extensionName] || !extension_settings[extensionName].stdApi) {
        throw new Error('STD API设置未配置');
    }
    
    const stdApiSettings = extension_settings[extensionName].stdApi;
    
    // 构建API URL
    let apiUrl = new URL('https://std.loliy.top/generate');
    
    // 添加参数
    let params = {
        sq: stdApiSettings.sq || '',
        'nai-key': stdApiSettings.naiKey || '',
        model: stdApiSettings.model || 'nai-diffusion-3',
        artist: stdApiSettings.artist || '',
        tag: prompt,
        negative: negativePrompt,
        size: stdApiSettings.size || '竖图',
        scale: stdApiSettings.scale || '5',
        steps: stdApiSettings.steps || '23',
        cfg_rescale: stdApiSettings.cfgRescale || '0',
        sampler: stdApiSettings.sampler || 'k_euler',
        noise_schedule: stdApiSettings.noiseSchedule || 'native'
    };
    
    // 如果禁用缓存，添加nocache参数
    if (!stdApiSettings.useCache) {
        params.nocache = '1';
    }
    
    // 将参数添加到URL
    Object.keys(params).forEach(key => {
        if (params[key] !== undefined && params[key] !== '') {
            apiUrl.searchParams.append(key, params[key]);
        }
    });
    
    // 发送请求
    return new Promise((resolve, reject) => {
        $.ajax({
            url: apiUrl.toString(),
            type: 'GET',
            xhrFields: {
                responseType: 'blob'
            },
            success: function(blob) {
                // 将Blob转换为URL
                const reader = new FileReader();
                reader.onloadend = function() {
                    resolve(reader.result); // 返回图像的Data URL
                };
                reader.onerror = function(error) {
                    reject(error);
                };
                reader.readAsDataURL(blob);
            },
            error: function(xhr, status, error) {
                reject(new Error(`STD API请求失败: ${status} ${error}`));
            }
        });
    });
}

// 修改handleIncomingMessage函数，增加对STD API的支持
// 找到handleIncomingMessage函数中处理matches的部分（大约在第270行），修改为：

// 下面的代码是需要修改的handleIncomingMessage函数片段
// 请找到原有的handleIncomingMessage函数，并替换掉下面这段代码

// 修改现有的handleIncomingMessage函数中的这部分代码
if (matches.length > 0) {
    // 延迟执行图片生成，确保消息首先显示出来
    setTimeout(async () => {
        try {
            toastr.info(`Generating ${matches.length} images...`);
            const insertType = extension_settings[extensionName].insertType;
            const backendType = extension_settings[extensionName].backendType || 'default';

            // 初始化message.extra
            if (!message.extra) {
                message.extra = {};
            }

            // 初始化image_swipes数组
            if (!Array.isArray(message.extra.image_swipes)) {
                message.extra.image_swipes = [];
            }

            // 如果已有图片，添加到swipes
            if (message.extra.image && !message.extra.image_swipes.includes(message.extra.image)) {
                message.extra.image_swipes.push(message.extra.image);
            }

            // 获取消息元素用于稍后更新
            const messageElement = $(`.mes[mesid="${context.chat.length - 1}"]`);

            // 处理每个匹配的图片标签
            for (let i = 0; i < matches.length; i++) {
                const prompt = matches[i];
                let imageUrl;
                
                // 根据不同的后端生成图像
                if (backendType === 'stdapi') {
                    // 使用STD API生成图像
                    imageUrl = await generateImageWithStdApi(prompt);
                } else {
                    // 使用默认方式（SillyTavern的/sd命令）
                    imageUrl = await SlashCommandParser.commands['sd'].callback({ quiet: insertType === INSERT_TYPE.NEW_MESSAGE ? 'false' : 'true' }, prompt);
                }
                
                if (typeof imageUrl === 'string' && imageUrl.trim().length > 0) {
                    if (insertType === INSERT_TYPE.INLINE) {
                        // 添加图片到swipes数组
                        message.extra.image_swipes.push(imageUrl);

                        // 设置第一张图片为主图片，或更新为最新生成的图片
                        message.extra.image = imageUrl;
                        message.extra.title = prompt;
                        message.extra.inline_image = true;

                        // 更新UI
                        appendMediaToMessage(message, messageElement);

                        // 保存聊天记录
                        await context.saveChat();
                    } else if (insertType === INSERT_TYPE.REPLACE) {
                        // Find the original image tag in the message
                        const originalTag = message.mes.match(imgTagRegex)[0];
                        // Replace it with an actual image tag
                        const newImageTag = `<img src="${imageUrl}" title="${prompt}" alt="${prompt}">`;
                        message.mes = message.mes.replace(originalTag, newImageTag);

                        // Update the message display using updateMessageBlock
                        updateMessageBlock(context.chat.length - 1, message);

                        // Save the chat
                        await context.saveChat();
                    }
                }
            }
            toastr.success(`${matches.length} images generated successfully`);
        } catch (error) {
            toastr.error(`Image generation error: ${error}`);
            console.error('Image generation error:', error);
        }
    }, 100); //防阻塞UI渲染
}