'use strict';

const { Gdk, Gio, GObject, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

/**
 * A Widget to implement the shortcuts in the preference window. It's a GtkBox,
 * which contains a button to activate listening for a shortcut and a shortcut-
 * clear-button.
 *
 * Some parts are from https://extensions.gnome.org/extension/2236/night-theme-switcher/.
 * _isBindingValid & _isKeyvalForbidden are straight up copied from its util.js
 * https://gitlab.com/rmnvgr/nightthemeswitcher-gnome-shell-extension/-/blob/main/src/utils.js
 */

var ShortcutListener = GObject.registerClass({
    GTypeName: 'ShortcutListener',
    Template: Gio.File.new_for_path(`${Me.path}/src/ui/shortcutListener.ui`).get_uri(),
    InternalChildren: ['button', 'clearButton', 'eventKeyController'],
    Properties: {
        keybinding: GObject.ParamSpec.string(
            'keybinding',
            'Keybinding',
            'Key sequence',
            GObject.ParamFlags.READWRITE,
            null
        )
    }
}, class ShortcutListener extends Gtk.Box {
    /**
     * Only allow 1 active ShortcutListener at a time
     */
    static isListening = false;
    static isAppendingShortcut = false;
    static listener = null;
    static listeningText = 'Press a shortcut...';
    static appendingText = 'Append a new shortcut...';

    /**
     * Starts listening for a keyboard shortcut.
     *
     * @param {ShortcutListener} shortcutListener the new active ShortcutListener
     */
    static listen(shortcutListener) {
        if (shortcutListener === ShortcutListener.listener)
            return;

        ShortcutListener.stopListening();

        shortcutListener.isActive = true;
        shortcutListener.setLabel(ShortcutListener.listeningText);
        ShortcutListener.listener = shortcutListener;
        ShortcutListener.isListening = true;
    }

    /**
     * Stops listening for a keyboard shortcut.
     */
    static stopListening() {
        if (!ShortcutListener.isListening)
            return;

        ShortcutListener.isListening = false;
        ShortcutListener.isAppendingShortcut = false;
        ShortcutListener.listener.isActive = false;
        ShortcutListener.listener.setLabel(ShortcutListener.listener.getKeybindingLabel());
        ShortcutListener.listener = null;
    }

    initialize(key, setting) {
        this._key = key;
        this._setting = setting;
        this.isActive = false;

        this.connect('realize', () => this.get_root().add_controller(this._eventKeyController));

        this.keybinding = this._setting.get_strv(key) ?? [];
    }

    /**
     * Toggles this to listen for a keyboard shortcut.
     */
    activate() {
        this.isActive ? ShortcutListener.stopListening() : ShortcutListener.listen(this);
    }

    /**
     * Gets the keybinding in a more pleasant to read format.
     * For example: [<Control><Super>e,<Super>a] will become
     * 'Ctrl+Super+E / Super+A' or 'Disabled'
     *
     * @returns {string}
     */
    getKeybindingLabel() {
        const kbLabel = this.keybinding.reduce((label, kb) => {
            const [, keyval, mask] = Gtk.accelerator_parse(kb);
            const l = Gtk.accelerator_get_label(keyval, mask);
            if (!label)
                return l;

            return l ? `${label} / ${l}` : label;
        }, '');

        return kbLabel || 'Disabled';
    }

    setLabel(label) {
        this._button.set_label(label);
    }

    _onShortcutButtonClicked() {
        this.activate();
    }

    _onKeybindingChanged() {
        this._setting.set_strv(this._key, this.keybinding);
        this._clearButton.set_sensitive(this.keybinding.length);
        this._button.set_label(this.getKeybindingLabel());
    }

    _onClearButtonClicked() {
        this.keybinding = [];
        ShortcutListener.stopListening();
    }

    _onKeyPressed(eventControllerKey, keyval, keycode, state) {
        if (this !== ShortcutListener.listener)
            return Gdk.EVENT_PROPAGATE;

        let mask = state & Gtk.accelerator_get_default_mod_mask();
        mask &= ~Gdk.ModifierType.LOCK_MASK;

        if (mask === 0) {
            switch (keyval) {
                case Gdk.KEY_BackSpace:
                    this.keybinding = [];
                    // falls through
                case Gdk.KEY_Escape:
                    ShortcutListener.stopListening();
                    return Gdk.EVENT_STOP;
                case Gdk.KEY_KP_Enter:
                case Gdk.KEY_Return:
                case Gdk.KEY_space:
                    ShortcutListener.isAppendingShortcut = !ShortcutListener.isAppendingShortcut;
                    this.setLabel(ShortcutListener.isAppendingShortcut
                        ? ShortcutListener.appendingText
                        : ShortcutListener.listeningText
                    );
                    return Gdk.EVENT_STOP;
            }
        }

        if (!this._isBindingValid({ mask, keycode, keyval }) ||
                !Gtk.accelerator_valid(keyval, mask))
            return Gdk.EVENT_STOP;

        const sc = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
        this.keybinding = ShortcutListener.isAppendingShortcut ? [...this.keybinding, sc] : [sc];

        ShortcutListener.stopListening();
        return Gdk.EVENT_STOP;
    }

    /**
     * Checks, if the given key combo is a valid binding.
     *
     * @param {{mask: number, keycode: number, keyval:number}} combo An object
     *      representing the key combo.
     * @returns {boolean} `true` if the key combo is a valid binding.
     */
    _isBindingValid({ mask, keycode, keyval }) {
        if ((mask === 0 || mask === Gdk.SHIFT_MASK) && keycode !== 0) {
            if (
                (keyval >= Gdk.KEY_a && keyval <= Gdk.KEY_z) ||
                (keyval >= Gdk.KEY_A && keyval <= Gdk.KEY_Z) ||
                (keyval >= Gdk.KEY_0 && keyval <= Gdk.KEY_9) ||
                (keyval >= Gdk.KEY_kana_fullstop && keyval <= Gdk.KEY_semivoicedsound) ||
                (keyval >= Gdk.KEY_Arabic_comma && keyval <= Gdk.KEY_Arabic_sukun) ||
                (keyval >= Gdk.KEY_Serbian_dje && keyval <= Gdk.KEY_Cyrillic_HARDSIGN) ||
                (keyval >= Gdk.KEY_Greek_ALPHAaccent && keyval <= Gdk.KEY_Greek_omega) ||
                (keyval >= Gdk.KEY_hebrew_doublelowline && keyval <= Gdk.KEY_hebrew_taf) ||
                (keyval >= Gdk.KEY_Thai_kokai && keyval <= Gdk.KEY_Thai_lekkao) ||
                (keyval >= Gdk.KEY_Hangul_Kiyeog && keyval <= Gdk.KEY_Hangul_J_YeorinHieuh) ||
                (keyval === Gdk.KEY_space && mask === 0) ||
                this._isKeyvalForbidden(keyval)
            )
                return false;
        }
        return true;
    }

    /**
     * Checks, if the given keyval is forbidden.
     *
     * @param {number} keyval The keyval number.
     * @returns {boolean} `true` if the keyval is forbidden.
     */
    _isKeyvalForbidden(keyval) {
        const forbiddenKeyvals = [
            Gdk.KEY_Home,
            Gdk.KEY_Left,
            Gdk.KEY_Up,
            Gdk.KEY_Right,
            Gdk.KEY_Down,
            Gdk.KEY_Page_Up,
            Gdk.KEY_Page_Down,
            Gdk.KEY_End,
            Gdk.KEY_Tab,
            Gdk.KEY_KP_Enter,
            Gdk.KEY_Return,
            Gdk.KEY_Mode_switch
        ];
        return forbiddenKeyvals.includes(keyval);
    }
});
