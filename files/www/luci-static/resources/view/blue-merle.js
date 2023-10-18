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

return view.extend({
	load: function() {
	},

	render: function(listData) {
		var query = decodeURIComponent(L.toArray(location.search.match(/\bquery=([^=]+)\b/))[1] || '');

        const imeiInputID = 'imei-input';
        const imsiInputID = 'imsi-input';

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
			])

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

		return view;
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
