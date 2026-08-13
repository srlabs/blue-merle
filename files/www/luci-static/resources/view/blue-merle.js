'use strict';
'require view';
'require fs';
'require ui';
'require rpc';

var css = '								\
	.controls {							\
		display: flex;					\
		margin: .5em 0 1em 0;			\
		flex-wrap: wrap;				\
		justify-content: space-around;	\
	}									\
										\
	.controls > * {						\
		padding: .25em;					\
		white-space: nowrap;			\
		flex: 1 1 33%;					\
		box-sizing: border-box;			\
		display: flex;					\
		flex-wrap: wrap;				\
	}									\
										\
	.controls > *:first-child,			\
	.controls > * > label {				\
		flex-basis: 100%;				\
		min-width: 250px;				\
	}									\
										\
	.controls > *:nth-child(2),			\
	.controls > *:nth-child(3) {		\
		flex-basis: 20%;				\
	}									\
										\
	.controls > * > .btn {				\
		flex-basis: 20px;				\
		text-align: center;				\
	}									\
										\
	.controls > * > * {					\
		flex-grow: 1;					\
		align-self: center;				\
	}									\
										\
	.controls > div > input {			\
		width: auto;					\
	}									\
										\
	.td.version,						\
	.td.size {							\
		white-space: nowrap;			\
	}									\
										\
	ul.deps, ul.deps ul, ul.errors {	\
		margin-left: 1em;				\
	}									\
										\
	ul.deps li, ul.errors li {			\
		list-style: none;				\
	}									\
										\
	ul.deps li:before {					\
		content: "↳";					\
		display: inline-block;			\
		width: 1em;						\
		margin-left: -1em;				\
	}									\
										\
	ul.deps li > span {					\
		white-space: nowrap;			\
	}									\
										\
	ul.errors li {						\
		color: #c44;					\
		font-size: 90%;					\
		font-weight: bold;				\
		padding-left: 1.5em;			\
	}									\
										\
	ul.errors li:before {				\
		content: "⚠";					\
		display: inline-block;			\
		width: 1.5em;					\
		margin-left: -1.5em;			\
	}									\
';

var isReadonlyView = !L.hasViewPermission() || null;

var callMountPoints = rpc.declare({
	object: 'luci',
	method: 'getMountPoints',
	expect: { result: [] }
});

var packages = {
	available: { providers: {}, pkgs: {} },
	installed: { providers: {}, pkgs: {} }
};

var languages = ['en'];

var currentDisplayMode = 'available', currentDisplayRows = [];



function handleReset(ev)
{
}


function callBlueMerle(arg) {
    const cmd = "/usr/libexec/blue-merle";
    var prom = fs.exec(cmd, [arg]);
    return prom.then(
        function(res) {
            console.log("Blue Merle arg", arg, "res", res);
            if (res.code != 0) {
                throw new Error("Return code " + res.code);
            } else {
                return res.stdout;
            }
        }
    ).catch(
        function(err) {
            console.log("Error calling Blue Merle", arg, err);
            throw err;
        }
    );
}

function readIMEI() {
    return callBlueMerle("read-imei");
}

function randomIMEI() {
    callBlueMerle("random-imei").then(
        function(res){
            readIMEI().then(
                console.log("new IMEI", imei)
            );
        }
    ).catch(
        function(err){
            console.log("Error", err);
        }
    );
}

function readIMSI() {
    return callBlueMerle("read-imsi");
}

function handleConfig(ev)
{
	var conf = {};

        const cmd = "/usr/libexec/blue-merle";
		var dlg = ui.showModal(_('Executing blue merle'), [
			E('p', { 'class': 'spinning' },
				_('Waiting for the <em>%h</em> command to complete…').format(cmd))
		]);

        var argv = ["random-imei"];
        console.log("Calling ", cmd, argv);
        // FIXME: Investigate whether we should be using fs.exec()
		fs.exec_direct(cmd, argv, 'text').then(function(res) {
		    console.log("Res:", res, "stdout", res.stdout, "stderr", res.stderr, "code", res.code);

			if (res.stdout)
				dlg.appendChild(E('pre', [ res.stdout ]));

			if (res.stderr) {
				dlg.appendChild(E('h5', _('Errors')));
				dlg.appendChild(E('pre', { 'class': 'errors' }, [ res.stderr ]));
			}

			console.log("Res.code: ", res.code);
			if (res.code !== 0)
				dlg.appendChild(E('p', _('The <em>%h %h</em> command failed with code <code>%d</code>.').format(cmd, argv, (res.code & 0xff) || -1)));

			dlg.appendChild(E('div', { 'class': 'right' },
				E('div', {
					'class': 'btn',
					'click': L.bind(function(res) {
						if (ui.menu && ui.menu.flushCache)
							ui.menu.flushCache();

						ui.hideModal();

						if (res.code !== 0)
							rejectFn(new Error(res.stderr || 'opkg error %d'.format(res.code)));
						else
							resolveFn(res);
					}, this, res)
				}, _('Dismiss'))));
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('Unable to execute <em>opkg %s</em> command: %s').format(cmd, err)));
			ui.hideModal();
		});



	fs.list('/etc/opkg').then(function(partials) {
		var files = [ '/etc/opkg.conf' ];

		for (var i = 0; i < partials.length; i++)
			if (partials[i].type == 'file' && partials[i].name.match(/\.conf$/))
				files.push('/etc/opkg/' + partials[i].name);

		return Promise.all(files.map(function(file) {
			return fs.read(file)
				.then(L.bind(function(conf, file, res) { conf[file] = res }, this, conf, file))
				.catch(function(err) {
				});
		}));
	}).then(function() {
		var body = [
			E('p', {}, _('Below is a listing of the various configuration files used by <em>opkg</em>. Use <em>opkg.conf</em> for global settings and <em>customfeeds.conf</em> for custom repository entries. The configuration in the other files may be changed but is usually not preserved by <em>sysupgrade</em>.'))
		];

		Object.keys(conf).sort().forEach(function(file) {
			body.push(E('h5', {}, '%h'.format(file)));
			body.push(E('textarea', {
				'name': file,
				'rows': Math.max(Math.min(L.toArray(conf[file].match(/\n/g)).length, 10), 3)
			}, '%h'.format(conf[file])));
		});

		body.push(E('div', { 'class': 'right' }, [
			E('div', {
				'class': 'btn cbi-button-neutral',
				'click': ui.hideModal
			}, _('Cancel')),
			' ',
			E('div', {
				'class': 'btn cbi-button-positive',
				'click': function(ev) {
					var data = {};
					findParent(ev.target, '.modal').querySelectorAll('textarea[name]')
						.forEach(function(textarea) {
							data[textarea.getAttribute('name')] = textarea.value
						});

					ui.showModal(_('OPKG Configuration'), [
						E('p', { 'class': 'spinning' }, _('Saving configuration data…'))
					]);

					Promise.all(Object.keys(data).map(function(file) {
						return fs.write(file, data[file]).catch(function(err) {
							ui.addNotification(null, E('p', {}, [ _('Unable to save %s: %s').format(file, err) ]));
						});
					})).then(ui.hideModal);
				},
				'disabled': isReadonlyView
			}, _('Save')),
		]));

		//ui.showModal(_('OPKG Configuration'), body);
	});
}

function handleShutdown(ev)
{
    return callBlueMerle("shutdown")
}

function handleRemove(ev)
{
}

function handleSimSwap(ev) {
    const spinnerID = 'swap-spinner-id';
	var dlg = ui.showModal(_('Starting SIM swap...'),
	    [
			E('p', { 'class': 'spinning', 'id': spinnerID },
				_('Shutting down modem…')
			 )
		]
	);
    callBlueMerle("shutdown-modem").then(
        function(res) {
            dlg.appendChild(
                E('pre', { 'class': 'result'},
                    res
                )
            );
            dlg.appendChild(
                E('p', { 'class': 'text'},
                    _("Generating Random IMEI")
                )
            );
            callBlueMerle("random-imei").then(
                function(res) {
                    document.getElementById(spinnerID).style = "display:none";
                    dlg.appendChild(
                        E('div', { 'class': 'text'},
                          [
                            E('p', { 'class': 'text'},
                                _("IMEI set:") + " " + res
                            ),
                            E('p', { 'class': 'text'},
                                _("Please shutdown the device, swap the SIM, then go to another place before booting")
                            ),
    			    		E('button', { 'class': 'btn cbi-button-positive', 'click': handleShutdown, 'disabled': isReadonlyView },
    				    	    [ _('Shutdown…') ]
                            )
                          ]
                        )
                    )
                }
            ).catch(
                function(err) {
                    dlg.appendChild(
                        E('p',{'class': 'error'},
                            _('Error setting IMEI! ') + err
                        )
                    )
                }
            );
        }
    ).catch(
        function(err) {
            dlg.appendChild(
                E('p',{'class': 'error'},
                    _('Error! ') + err
                )
            )
        }
    );
}

function handleOpkg(ev)
{
}

function handleUpload(ev)
{
}


function handleInput(ev) {
}


/* ---- MAC / BSSID vendor-mimicry section ------------------------------- */

function callBlueMerleArgs(args) {
    const cmd = "/usr/libexec/blue-merle";
    return fs.exec(cmd, args).then(function(res) {
        if (res.code != 0)
            throw new Error("Return code " + res.code);
        return res.stdout || "";
    });
}

function parseKV(text) {
    var o = {};
    (text || "").split("\n").forEach(function(line) {
        var i = line.indexOf("=");
        if (i > 0)
            o[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
    return o;
}

function onVendorChange(role, wrap) {
    var boxes = wrap.querySelectorAll('input[type=checkbox]');
    var chosen = [], total = 0;
    boxes.forEach(function(cb) { total++; if (cb.checked) chosen.push(cb.value); });
    // All checked == no restriction, so store empty to keep the config clean.
    var csv = (chosen.length === total) ? '' : chosen.join(',');
    callBlueMerleArgs([role === 'ap' ? 'mac-set-ap' : 'mac-set-client', csv]);
}

function vendorCheckboxes(role, allCsv, selCsv) {
    var all = (allCsv || "").split(",").filter(Boolean);
    var sel = (selCsv || "").split(",").filter(Boolean);
    var wrap = E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.6em;margin:.3em 0 .6em 0;' });
    all.forEach(function(v) {
        var cb = E('input', { 'type': 'checkbox', 'value': v });
        // Empty selection means "all", so pre-check accordingly.
        if (sel.length === 0 || sel.indexOf(v) >= 0)
            cb.checked = true;
        cb.addEventListener('change', function() { onVendorChange(role, wrap); });
        wrap.appendChild(E('label', { 'style': 'white-space:nowrap;' }, [cb, ' ' + v]));
    });
    return wrap;
}

function macModeHelp(mode) {
    if (mode === 'split')
        return _('Split gives the hotspot (BSSID) and the client/WAN side different vendor OUIs. Coherent is the safer default; use split only if the Mudi runs as a pure Wi-Fi client and does not broadcast its own hotspot. Mixed-vendor OUIs on one device are not a reliable tell on their own — the stronger signal is the radio fingerprint (see the notes).');
    return _('Coherent makes the whole device — both radios and the WAN — share one vendor OUI with sequential MACs, exactly like a real single-vendor router. Recommended for normal use (LTE uplink, or when the Mudi hosts a hotspot).');
}

function populateMacSection(container) {
    return callBlueMerle('mac-status').then(function(text) {
        var st = parseKV(text);
        var enabled = st.mimic === '1';
        var native = st.native === '1';
        var mode = st.mode || 'coherent';
        container.innerHTML = '';

        var box = E('div', { 'style': 'border:1px solid rgba(128,128,128,.35);border-radius:6px;padding:.8em 1em;max-width:760px;' });
        container.appendChild(box);

        // 1) master enable
        var toggle = E('input', { 'type': 'checkbox', 'id': 'mac-mimic-toggle', 'disabled': isReadonlyView });
        toggle.checked = enabled;
        toggle.addEventListener('change', function() {
            // Only flip the setting — no rebuild, so the preview output survives.
            callBlueMerle(toggle.checked ? 'mac-on' : 'mac-off');
        });
        box.appendChild(E('label', { 'style': 'font-weight:bold;font-size:1.05em;' },
            [toggle, ' ' + _('Enable MAC / BSSID mimicry')]));
        box.appendChild(E('p', { 'class': 'cbi-value-description' },
            _('Off by default. When on, blue-merle draws a real vendor OUI from /etc/blue-merle/oui-vendors and appends random bytes, so the device blends in with ordinary consumer hardware instead of an obviously-randomized address.')));

        if (native)
            box.appendChild(E('p', { 'style': 'color:#c60;font-weight:bold;' },
                _('The GL firmware provides its own MAC randomization; blue-merle is deferring to it (auto_disable_native).')));

        box.appendChild(E('hr', { 'style': 'border:none;border-top:1px solid rgba(128,128,128,.25);margin:.7em 0;' }));

        // 2) mode
        var modeSel = E('select', { 'disabled': isReadonlyView }, [
            E('option', { 'value': 'coherent' }, _('Coherent (recommended)')),
            E('option', { 'value': 'split' }, _('Split (advanced — pure client only)'))
        ]);
        modeSel.value = mode;
        modeSel.addEventListener('change', function() {
            // Mode change swaps which vendor pickers apply, so rebuild the section.
            callBlueMerleArgs(['mac-set-mode', modeSel.value]).then(function() {
                populateMacSection(container);
            });
        });
        box.appendChild(E('div', { 'style': 'margin:.2em 0;' }, [
            E('label', { 'style': 'margin-right:.5em;font-weight:bold;' }, _('OUI mode') + ':'),
            modeSel
        ]));
        box.appendChild(E('p', { 'class': 'cbi-value-description' }, macModeHelp(mode)));

        // 3) vendor pickers — only what the current mode actually uses
        if (mode === 'split') {
            box.appendChild(E('h4', { 'style': 'margin-bottom:.2em;' }, _('Router / BSSID vendors')));
            box.appendChild(E('p', { 'class': 'cbi-value-description' }, _('OUIs used for the hotspot the Mudi broadcasts.')));
            box.appendChild(vendorCheckboxes('ap', st.ap_all, st.ap_vendors));
            box.appendChild(E('h4', { 'style': 'margin-bottom:.2em;' }, _('Client / device vendors')));
            box.appendChild(E('p', { 'class': 'cbi-value-description' }, _('OUIs used for the client/WAN side (phones, laptops).')));
            box.appendChild(vendorCheckboxes('client', st.client_all, st.client_vendors));
        } else {
            box.appendChild(E('h4', { 'style': 'margin-bottom:.2em;' }, _('Vendor to mimic')));
            box.appendChild(E('p', { 'class': 'cbi-value-description' },
                _('The whole device will look like one of these brands. Leave all checked to pick a brand at random each time; check just one (e.g. tp-link) to always look like that vendor.')));
            box.appendChild(vendorCheckboxes('ap', st.ap_all, st.ap_vendors));
        }

        // 4) preview + apply
        box.appendChild(E('hr', { 'style': 'border:none;border-top:1px solid rgba(128,128,128,.25);margin:.7em 0;' }));
        var previewOut = E('pre', { 'style': 'margin:.5em 0;' }, '');
        box.appendChild(E('div', { 'class': 'control-group' }, [
            E('button', { 'class': 'btn cbi-button', 'click': function() {
                callBlueMerle('mac-preview').then(function(t) { previewOut.textContent = t; });
            } }, _('Preview example MACs')),
            ' ',
            E('button', { 'class': 'btn cbi-button-positive', 'disabled': isReadonlyView, 'click': function() {
                callBlueMerle('mac-apply').then(function() {
                    ui.addNotification(null, E('p', _('MAC mimicry applied. Reload Wi-Fi / restart the network for it to take effect.')));
                });
            } }, _('Apply now'))
        ]));
        box.appendChild(E('p', { 'class': 'cbi-value-description' },
            _('Preview only shows examples and changes nothing. Apply writes the new MACs; reload Wi-Fi / restart the network for them to take effect. They are also re-applied on every boot while enabled.')));
        box.appendChild(previewOut);
    }).catch(function(err) {
        container.innerHTML = '';
        container.appendChild(E('p', { 'class': 'error' }, _('Failed to load MAC settings: ') + err));
    });
}


return view.extend({
	load: function() {
	},

	render: function(listData) {
		var query = decodeURIComponent(L.toArray(location.search.match(/\bquery=([^=]+)\b/))[1] || '');

        const imeiInputID = 'imei-input';
        const imsiInputID = 'imsi-input';

		var macContainer = E('div', { 'id': 'mac-section' }, [
			E('p', { 'class': 'spinning' }, _('Loading MAC settings…'))
		]);

		var view = E([], [
			E('style', { 'type': 'text/css' }, [ css ]),

			E('h2', {}, _('Blue Merle')),

			E('div', { 'class': 'controls' }, [
				E('div', {}, [
					E('label', {}, _('IMEI') + ':'),
					E('span', { 'class': 'control-group' }, [
						E('input', { 'id':imeiInputID, 'type': 'text', 'name': 'filter', 'placeholder': _('e.g. 31428392718429'), 'minlength':14, 'maxlenght':14, 'required':true, 'value': query, 'input': handleInput, 'disabled': true })
						//, E('button', { 'class': 'btn cbi-button', 'click': handleReset }, [ _('Clear') ])
						//, E('button', { 'class': 'btn cbi-button', 'click': randomIMEI }, [ _('Set Random') ])
					])
				]),

				E('div', {}, [
					E('label', {}, _('IMSI') + ':'),
					E('span', { 'class': 'control-group' }, [
						E('input', { 'id':imsiInputID, 'type': 'text', 'name': 'filter', 'placeholder': _('e.g. 31428392718429'), 'minlength':14, 'maxlenght':14, 'required':true, 'value': query, 'input': handleInput, 'disabled': true })
						//, E('button', { 'class': 'btn cbi-button', 'click': handleReset }, [ _('Clear') ])
					])
				]),
			]),

			E('div', {}, [
				E('label', {}, _('Actions') + ':'), ' ',
				E('span', { 'class': 'control-group' }, [
					E('button', { 'class': 'btn cbi-button-positive', 'data-command': 'update', 'click': handleSimSwap, 'disabled': isReadonlyView }, [ _('SIM swap…') ]), ' '
					//, E('button', { 'class': 'btn cbi-button-action', 'click': handleUpload, 'disabled': isReadonlyView }, [ _('IMEI change…') ]), ' '
					//, E('button', { 'class': 'btn cbi-button-neutral', 'click': handleConfig }, [ _('Shred config…') ])
				])
			]),

			E('h3', {}, _('MAC / BSSID privacy')),
			macContainer

		]);

		readIMEI().then(
		    function(imei) {
		        const e = document.getElementById(imeiInputID);
		        console.log("Input: ", e, e.placeholder, e.value);
		        e.value = imei;
		    }
		).catch(
		    function(err){
		        console.log("Error: ", err)
		    }
		)

		readIMSI().then(
		    function(imsi) {
		        const e = document.getElementById(imsiInputID);
		        e.value = imsi;
		    }
		).catch(
		    function(err){
		        const e = document.getElementById(imsiInputID);
		        e.value = "No IMSI found";
		    }
		)

		populateMacSection(macContainer);

		return view;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
