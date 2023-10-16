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

function handlePage(ev)
{
	var filter = document.querySelector('input[name="filter"]'),
	    offset = +ev.target.parentNode.getAttribute('data-offset'),
	    next = ev.target.classList.contains('next'),
	    pagers = document.querySelectorAll('.controls > .pager');

	if ((next && (offset + 100) >= currentDisplayRows.length) ||
	    (!next && (offset < 100)))
	    return;

	offset += next ? 100 : -100;

	for (var i = 0; i < pagers.length; i++) {
		pagers[i].setAttribute('data-offset', offset);
		pagers[i].querySelector('.text').firstChild.data = currentDisplayRows.length
			? _('Displaying %d-%d of %d').format(1 + offset, Math.min(offset + 100, currentDisplayRows.length), currentDisplayRows.length)
			: _('No packages');

		if (offset < 100)
			pagers[i].querySelector('.prev').setAttribute('disabled', 'disabled');
		else
			pagers[i].querySelector('.prev').removeAttribute('disabled');

		if ((offset + 100) >= currentDisplayRows.length)
			pagers[i].querySelector('.next').setAttribute('disabled', 'disabled');
		else
			pagers[i].querySelector('.next').removeAttribute('disabled');
	}

	var placeholder = _('No information available');

	if (filter.value)
		placeholder = [
			E('span', {}, _('No packages matching "<strong>%h</strong>".').format(filter.value)), ' (',
			E('a', { href: '#', click: handleReset }, _('Reset')), ')'
		];

	cbi_update_table('#packages', currentDisplayRows.slice(offset, offset + 100),
		placeholder);
}

function handleMode(ev)
{
	var tab = findParent(ev.target, 'li');
	if (tab.getAttribute('data-mode') === currentDisplayMode)
		return;

	tab.parentNode.querySelectorAll('li').forEach(function(li) {
		li.classList.remove('cbi-tab');
		li.classList.add('cbi-tab-disabled');
	});

	tab.classList.remove('cbi-tab-disabled');
	tab.classList.add('cbi-tab');

	currentDisplayMode = tab.getAttribute('data-mode');

	display(document.querySelector('input[name="filter"]').value);

	ev.target.blur();
	ev.preventDefault();
}

function handleI18nFilter(ev)
{
	display(document.querySelector('input[name="filter"]').value);
}

function orderOf(c)
{
	if (c === '~')
		return -1;
	else if (c === '' || c >= '0' && c <= '9')
		return 0;
	else if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
		return c.charCodeAt(0);
	else
		return c.charCodeAt(0) + 256;
}

function compareVersion(val, ref)
{
	var vi = 0, ri = 0,
	    isdigit = { 0:1, 1:1, 2:1, 3:1, 4:1, 5:1, 6:1, 7:1, 8:1, 9:1 };

	val = val || '';
	ref = ref || '';

	if (val === ref)
		return 0;

	while (vi < val.length || ri < ref.length) {
		var first_diff = 0;

		while ((vi < val.length && !isdigit[val.charAt(vi)]) ||
		       (ri < ref.length && !isdigit[ref.charAt(ri)])) {
			var vc = orderOf(val.charAt(vi)), rc = orderOf(ref.charAt(ri));
			if (vc !== rc)
				return vc - rc;

			vi++; ri++;
		}

		while (val.charAt(vi) === '0')
			vi++;

		while (ref.charAt(ri) === '0')
			ri++;

		while (isdigit[val.charAt(vi)] && isdigit[ref.charAt(ri)]) {
			first_diff = first_diff || (val.charCodeAt(vi) - ref.charCodeAt(ri));
			vi++; ri++;
		}

		if (isdigit[val.charAt(vi)])
			return 1;
		else if (isdigit[ref.charAt(ri)])
			return -1;
		else if (first_diff)
			return first_diff;
	}

	return 0;
}

function versionSatisfied(ver, ref, vop)
{
	var r = compareVersion(ver, ref);

	switch (vop) {
	case '<':
	case '<=':
		return r <= 0;

	case '>':
	case '>=':
		return r >= 0;

	case '<<':
		return r < 0;

	case '>>':
		return r > 0;

	case '=':
		return r == 0;
	}

	return false;
}

function pkgStatus(pkg, vop, ver, info)
{
	info.errors = info.errors || [];
	info.install = info.install || [];

	if (pkg.installed) {
		if (vop && !versionSatisfied(pkg.version, ver, vop)) {
			var repl = null;

			(packages.available.providers[pkg.name] || []).forEach(function(p) {
				if (!repl && versionSatisfied(p.version, ver, vop))
					repl = p;
			});

			if (repl) {
				info.install.push(repl);
				return E('span', {
					'class': 'label',
					'data-tooltip': _('Requires update to %h %h')
						.format(repl.name, repl.version)
				}, _('Needs upgrade'));
			}

			info.errors.push(_('The installed version of package <em>%h</em> is not compatible, require %s while %s is installed.').format(pkg.name, truncateVersion(ver, vop), truncateVersion(pkg.version)));

			return E('span', {
				'class': 'label warning',
				'data-tooltip': _('Require version %h %h,\ninstalled %h')
					.format(vop, ver, pkg.version)
			}, _('Version incompatible'));
		}

		return E('span', { 'class': 'label notice' }, _('Installed'));
	}
	else if (!pkg.missing) {
		if (!vop || versionSatisfied(pkg.version, ver, vop)) {
			info.install.push(pkg);
			return E('span', { 'class': 'label' }, _('Not installed'));
		}

		info.errors.push(_('The repository version of package <em>%h</em> is not compatible, require %s but only %s is available.')
				.format(pkg.name, truncateVersion(ver, vop), truncateVersion(pkg.version)));

		return E('span', {
			'class': 'label warning',
			'data-tooltip': _('Require version %h %h,\ninstalled %h')
				.format(vop, ver, pkg.version)
		}, _('Version incompatible'));
	}
	else {
		info.errors.push(_('Required dependency package <em>%h</em> is not available in any repository.').format(pkg.name));

		return E('span', { 'class': 'label warning' }, _('Not available'));
	}
}

function renderDependencyItem(dep, info, flat)
{
	var li = E('li'),
	    vop = dep.version ? dep.version[0] : null,
	    ver = dep.version ? dep.version[1] : null,
	    depends = [];

	for (var i = 0; dep.pkgs && i < dep.pkgs.length; i++) {
		var pkg = packages.installed.pkgs[dep.pkgs[i]] ||
		          packages.available.pkgs[dep.pkgs[i]] ||
		          { name: dep.name };

		if (i > 0)
			li.appendChild(document.createTextNode(' | '));

		var text = pkg.name;

		if (pkg.installsize)
			text += ' (%1024mB)'.format(pkg.installsize);
		else if (pkg.size)
			text += ' (~%1024mB)'.format(pkg.size);

		li.appendChild(E('span', { 'data-tooltip': pkg.description },
			[ text, ' ', pkgStatus(pkg, vop, ver, info) ]));

		(pkg.depends || []).forEach(function(d) {
			if (depends.indexOf(d) === -1)
				depends.push(d);
		});
	}

	if (!li.firstChild)
		li.appendChild(E('span', {},
			[ dep.name, ' ',
			  pkgStatus({ name: dep.name, missing: true }, vop, ver, info) ]));

	if (!flat) {
		var subdeps = renderDependencies(depends, info);
		if (subdeps)
			li.appendChild(subdeps);
	}

	return li;
}

function renderDependencies(depends, info, flat)
{
	var deps = depends || [],
	    items = [];

	info.seen = info.seen || [];

	for (var i = 0; i < deps.length; i++) {
		var dep, vop, ver;

		if (deps[i] === 'libc')
			continue;

		if (deps[i].match(/^(.+?)\s+\((<=|>=|<<|>>|<|>|=)(.+?)\)/)) {
			dep = RegExp.$1.trim();
			vop = RegExp.$2.trim();
			ver = RegExp.$3.trim();
		}
		else {
			dep = deps[i].trim();
			vop = ver = null;
		}

		if (info.seen[dep])
			continue;

		var pkgs = [];

		(packages.installed.providers[dep] || []).forEach(function(p) {
			if (pkgs.indexOf(p.name) === -1) pkgs.push(p.name);
		});

		(packages.available.providers[dep] || []).forEach(function(p) {
			if (pkgs.indexOf(p.name) === -1) pkgs.push(p.name);
		});

		info.seen[dep] = {
			name:    dep,
			pkgs:    pkgs,
			version: [vop, ver]
		};

		items.push(renderDependencyItem(info.seen[dep], info, flat));
	}

	if (items.length)
		return E('ul', { 'class': 'deps' }, items);

	return null;
}

function truncateVersion(v, op)
{
	v = v.replace(/\b(([a-f0-9]{8})[a-f0-9]{24,32})\b/,
		'<span data-tooltip="$1">$2…</span>');

	if (!op || op === '=')
		return v;

	return '%h %h'.format(op, v);
}

function handleReset(ev)
{
	var filter = document.querySelector('input[name="filter"]');

	filter.value = '';
	display();
}

function handleInstall(ev)
{
	var name = ev.target.getAttribute('data-package'),
	    pkg = packages.available.pkgs[name],
	    depcache = {},
	    size;

	if (pkg.installsize)
		size = _('~%1024mB installed').format(pkg.installsize);
	else if (pkg.size)
		size = _('~%1024mB compressed').format(pkg.size);
	else
		size = _('unknown');

	var deps = renderDependencies(pkg.depends, depcache),
	    tree = null, errs = null, inst = null, desc = null;

	if (depcache.errors && depcache.errors.length) {
		errs = E('ul', { 'class': 'errors' });
		depcache.errors.forEach(function(err) {
			errs.appendChild(E('li', {}, err));
		});
	}

	var totalsize = pkg.installsize || pkg.size || 0,
	    totalpkgs = 1,
	    suggestsize = 0;

	if (depcache.install && depcache.install.length)
		depcache.install.forEach(function(ipkg) {
			totalsize += ipkg.installsize || ipkg.size || 0;
			totalpkgs++;
		});

	var luci_basename = pkg.name.match(/^luci-([^-]+)-(.+)$/),
	    i18n_packages = [],
	    i18n_tree;

	if (luci_basename && (luci_basename[1] != 'i18n' || luci_basename[2].indexOf('base-') === 0)) {
		var i18n_filter;

		if (luci_basename[1] == 'i18n') {
			var basenames = [];

			for (var pkgname in packages.installed.pkgs) {
				var m = pkgname.match(/^luci-([^-]+)-(.+)$/);

				if (m && m[1] != 'i18n')
					basenames.push(m[2]);
			}

			if (basenames.length)
				i18n_filter = new RegExp('^luci-i18n-(' + basenames.join('|') + ')-' + pkg.name.replace(/^luci-i18n-base-/, '') + '$');
		}
		else {
			i18n_filter = new RegExp('^luci-i18n-' + luci_basename[2] + '-(' + languages.join('|') + ')$');
		}

		if (i18n_filter) {
			for (var pkgname in packages.available.pkgs)
				if (pkgname != pkg.name && pkgname.match(i18n_filter))
					i18n_packages.push(pkgname);

			var i18ncache = {};

			i18n_tree = renderDependencies(i18n_packages, i18ncache, true);

			if (i18ncache.install && i18ncache.install.length) {
				i18ncache.install.forEach(function(ipkg) {
					suggestsize += ipkg.installsize || ipkg.size || 0;
				});
			}
		}
	}

	inst = E('p', [
		_('Require approx. %1024mB size for %d package(s) to install.')
			.format(totalsize, totalpkgs),
		' ',
		suggestsize ? _('Suggested translations require approx. %1024mB additional space.').format(suggestsize) : ''
	]);

	if (deps) {
		tree = E('li', '<strong>%s:</strong>'.format(_('Dependencies')));
		tree.appendChild(deps);
	}

	if (pkg.description) {
		desc = E('div', {}, [
			E('h5', {}, _('Description')),
			E('p', {}, pkg.description)
		]);
	}

	ui.showModal(_('Details for package <em>%h</em>').format(pkg.name), [
		E('ul', {}, [
			E('li', '<strong>%s:</strong> %h'.format(_('Version'), pkg.version)),
			E('li', '<strong>%s:</strong> %h'.format(_('Size'), size)),
			tree || '',
			i18n_packages.length ? E('li', [
				E('strong', [_('Suggested translations'), ':']),
				i18n_tree
			]) : ''
		]),
		desc || '',
		errs || inst || '',
		E('div', [
			E('hr'),
			i18n_packages.length ? E('p', [
				E('label', { 'class': 'cbi-checkbox' }, [
					E('input', {
						'id': 'i18ninstall-cb',
						'type': 'checkbox',
						'name': 'i18ninstall',
						'data-packages': i18n_packages.join(' '),
						'disabled': isReadonlyView,
						'checked': true
					}), ' ',
					E('label', { 'for': 'i18ninstall-cb' }), ' ',
					_('Install suggested translation packages as well')
				])
			]) : '',
			E('p', [
				E('label', { 'class': 'cbi-checkbox' }, [
					E('input', {
						'id': 'overwrite-cb',
						'type': 'checkbox',
						'name': 'overwrite',
						'disabled': isReadonlyView
					}), ' ',
					E('label', { 'for': 'overwrite-cb' }), ' ',
					_('Allow overwriting conflicting package files')
				])
			])
		]),
		E('div', { 'class': 'right' }, [
			E('div', {
				'class': 'btn',
				'click': ui.hideModal
			}, _('Cancel')),
			' ',
			E('div', {
				'data-command': 'install',
				'data-package': name,
				'class': 'btn cbi-button-action',
				'click': handleOpkg,
				'disabled': isReadonlyView
			}, _('Install'))
		])
	]);
}

function handleManualInstall(ev)
{
	var name_or_url = document.querySelector('input[name="install"]').value,
	    install = E('div', {
			'class': 'btn cbi-button-action',
			'data-command': 'install',
			'data-package': name_or_url,
			'click': function(ev) {
				document.querySelector('input[name="install"]').value = '';
				handleOpkg(ev);
			}
		}, _('Install')), warning;

	if (!name_or_url.length) {
		return;
	}
	else if (name_or_url.indexOf('/') !== -1) {
		warning = E('p', {}, _('Installing packages from untrusted sources is a potential security risk! Really attempt to install <em>%h</em>?').format(name_or_url));
	}
	else if (!packages.available.providers[name_or_url]) {
		warning = E('p', {}, _('The package <em>%h</em> is not available in any configured repository.').format(name_or_url));
		install = '';
	}
	else {
		warning = E('p', {}, _('Really attempt to install <em>%h</em>?').format(name_or_url));
	}

	ui.showModal(_('Manually install package'), [
		warning,
		E('div', { 'class': 'right' }, [
			E('div', {
				'click': ui.hideModal,
				'class': 'btn cbi-button-neutral'
			}, _('Cancel')),
			' ', install
		])
	]);
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

        var argv = ["shred"];
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
					ui.addNotification(null, E('p', {}, [ _('Unable to read %s: %s').format(file, err) ]));
					ui.hideModal();
					throw err;
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

function handleRemove(ev)
{
	var name = ev.target.getAttribute('data-package'),
	    pkg = packages.installed.pkgs[name],
	    avail = packages.available.pkgs[name] || {},
	    size, desc;

	if (avail.installsize)
		size = _('~%1024mB installed').format(avail.installsize);
	else if (avail.size)
		size = _('~%1024mB compressed').format(avail.size);
	else
		size = _('unknown');

	if (avail.description) {
		desc = E('div', {}, [
			E('h5', {}, _('Description')),
			E('p', {}, avail.description)
		]);
	}

	ui.showModal(_('Remove package <em>%h</em>').format(pkg.name), [
		E('ul', {}, [
			E('li', '<strong>%s:</strong> %h'.format(_('Version'), pkg.version)),
			E('li', '<strong>%s:</strong> %h'.format(_('Size'), size))
		]),
		desc || '',
		E('div', { 'style': 'display:flex; justify-content:space-between; flex-wrap:wrap' }, [
			E('label', { 'class': 'cbi-checkbox', 'style': 'float:left' }, [
				E('input', { 'id': 'autoremove-cb', 'type': 'checkbox', 'checked': 'checked', 'name': 'autoremove', 'disabled': isReadonlyView }), ' ',
				E('label', { 'for': 'autoremove-cb' }), ' ',
				_('Automatically remove unused dependencies')
			]),
			E('div', { 'style': 'flex-grow:1', 'class': 'right' }, [
				E('div', {
					'class': 'btn',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('div', {
					'data-command': 'remove',
					'data-package': name,
					'class': 'btn cbi-button-negative',
					'click': handleOpkg,
					'disabled': isReadonlyView
				}, _('Remove'))
			])
		])
	]);
}

function handleSimSwap(ev) {
	var dlg = ui.showModal(_('Starting SIM swap...'),
	    [
			E('p', { 'class': 'spinning' },
				_('Shutting down modem…')
			 )
		]
	)
}

function handleOpkg(ev)
{
	return new Promise(function(resolveFn, rejectFn) {
		var cmd = ev.target.getAttribute('data-command'),
		    pkg = ev.target.getAttribute('data-package'),
		    rem = document.querySelector('input[name="autoremove"]'),
		    owr = document.querySelector('input[name="overwrite"]'),
		    i18n = document.querySelector('input[name="i18ninstall"]');

		var dlg = ui.showModal(_('Executing package manager'), [
			E('p', { 'class': 'spinning' },
				_('Waiting for the <em>opkg %h</em> command to complete…').format(cmd))
		]);

		var argv = [ cmd, '--force-removal-of-dependent-packages' ];

		if (rem && rem.checked)
			argv.push('--autoremove');

		if (owr && owr.checked)
			argv.push('--force-overwrite');

		if (i18n && i18n.checked)
			argv.push.apply(argv, i18n.getAttribute('data-packages').split(' '));

		if (pkg != null)
			argv.push(pkg);

		fs.exec_direct('/usr/libexec/opkg-call', argv, 'json').then(function(res) {
			dlg.removeChild(dlg.lastChild);

			if (res.stdout)
				dlg.appendChild(E('pre', [ res.stdout ]));

			if (res.stderr) {
				dlg.appendChild(E('h5', _('Errors')));
				dlg.appendChild(E('pre', { 'class': 'errors' }, [ res.stderr ]));
			}

			if (res.code !== 0)
				dlg.appendChild(E('p', _('The <em>opkg %h</em> command failed with code <code>%d</code>.').format(cmd, (res.code & 0xff) || -1)));

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
	});
}

function handleUpload(ev)
{
	var path = '/tmp/upload.ipk';
	return ui.uploadFile(path).then(L.bind(function(btn, res) {
		ui.showModal(_('Manually install package'), [
			E('p', {}, _('Installing packages from untrusted sources is a potential security risk! Really attempt to install <em>%h</em>?').format(res.name)),
			E('ul', {}, [
				res.size ? E('li', {}, '%s: %1024.2mB'.format(_('Size'), res.size)) : '',
				res.checksum ? E('li', {}, '%s: %s'.format(_('MD5'), res.checksum)) : '',
				res.sha256sum ? E('li', {}, '%s: %s'.format(_('SHA256'), res.sha256sum)) : ''
			]),
			E('div', { 'class': 'right' }, [
				E('div', {
					'click': function(ev) {
						ui.hideModal();
						fs.remove(path);
					},
					'class': 'btn cbi-button-neutral'
				}, _('Cancel')), ' ',
				E('div', {
					'class': 'btn cbi-button-action',
					'data-command': 'install',
					'data-package': path,
					'click': function(ev) {
						handleOpkg(ev).finally(function() {
							fs.remove(path)
						});
					}
				}, _('Install'))
			])
		]);
	}, this, ev.target));
}


var inputTimeout = null;

function handleInput(ev) {
	if (inputTimeout !== null)
		window.clearTimeout(inputTimeout);

	inputTimeout = window.setTimeout(function() {
		display(ev.target.value);
	}, 250);
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
						E('input', { 'id':imeiInputID, 'type': 'text', 'name': 'filter', 'placeholder': _('e.g. 31428392718429'), 'minlength':14, 'maxlenght':14, 'required':true, 'value': query, 'input': handleInput }),
						E('button', { 'class': 'btn cbi-button', 'click': handleReset }, [ _('Clear') ]),
						E('button', { 'class': 'btn cbi-button', 'click': randomIMEI }, [ _('Set Random') ])
					])
				]),

				E('div', {}, [
					E('label', {}, _('IMSI') + ':'),
					E('span', { 'class': 'control-group' }, [
						E('input', { 'id':imsiInputID, 'type': 'text', 'name': 'filter', 'placeholder': _('e.g. 31428392718429'), 'minlength':14, 'maxlenght':14, 'required':true, 'value': query, 'input': handleInput }),
						E('button', { 'class': 'btn cbi-button', 'click': handleReset }, [ _('Clear') ])
					])
				]),

				E('div', {}, [
					E('label', {}, _('Actions') + ':'), ' ',
					E('span', { 'class': 'control-group' }, [
						E('button', { 'class': 'btn cbi-button-positive', 'data-command': 'update', 'click': handleSimSwap, 'disabled': isReadonlyView }, [ _('SIM swap…') ]), ' ',
						E('button', { 'class': 'btn cbi-button-action', 'click': handleUpload, 'disabled': isReadonlyView }, [ _('IMEI change…') ]), ' ',
						E('button', { 'class': 'btn cbi-button-neutral', 'click': handleConfig }, [ _('Shred config…') ])
					])
				])
			])

		]);

		readIMEI().then(
		    function(imei) {
		        console.log("My controllolol", imei);
		        const e = document.getElementById(imeiInputID);
		        console.log("Input: ", e, e.placeholder, e.value);
		        e.value = imei;
		    }
		).catch(
		    function(err){
		        console.log("Errrrrr", err)
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