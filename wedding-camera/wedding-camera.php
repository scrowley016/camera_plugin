<?php
/**
 * Plugin Name: Wedding Camera
 * Description: Guest wedding photo uploads with a live in-browser camera, opt-in live wall, reversible frames, QR/NFC sharing, and admin controls.
 * Version: 0.5.3
 * Author: Shannon & Alex
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'WCAM_VERSION', '0.5.3' );
define( 'WCAM_URL', plugin_dir_url( __FILE__ ) );
define( 'WCAM_PATH', plugin_dir_path( __FILE__ ) );

final class Wedding_Camera {
    const META_GUEST_NAME = '_wcam_guest_name';
    const META_CAPTION    = '_wcam_caption';
    const META_LIVE       = '_wcam_live';
    const META_TOKEN_HASH = '_wcam_token_hash';
    const META_GUEST      = '_wcam_guest_upload';
    const META_FAVORITE   = '_wcam_favorite';
    const META_FRAME_ID   = '_wcam_frame_id';

    const OPTION_SETTINGS = 'wcam_settings';
    const OPTION_FRAMES   = 'wcam_frames';

    public function __construct() {
        add_action( 'rest_api_init', [ $this, 'register_routes' ] );
        add_shortcode( 'wedding_camera', [ $this, 'camera_shortcode' ] );
        add_shortcode( 'wedding_photo_wall', [ $this, 'wall_shortcode' ] );
        add_shortcode( 'wedding_camera_qr', [ $this, 'qr_shortcode' ] );

        add_action( 'wp_enqueue_scripts', [ $this, 'register_assets' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'admin_assets' ] );
        add_action( 'admin_menu', [ $this, 'admin_menu' ] );
        add_action( 'admin_post_wcam_toggle_live', [ $this, 'admin_toggle_live' ] );
        add_action( 'admin_post_wcam_delete_photo', [ $this, 'admin_delete_photo' ] );
        add_action( 'admin_post_wcam_toggle_favorite', [ $this, 'admin_toggle_favorite' ] );
        add_action( 'admin_post_wcam_update_photo', [ $this, 'admin_update_photo' ] );
        add_action( 'admin_post_wcam_save_settings', [ $this, 'admin_save_settings' ] );
        add_action( 'admin_post_wcam_save_share', [ $this, 'admin_save_share' ] );
    }

    private function default_settings() {
        return [
            'uploads_open'        => '1',
            'default_live'        => '1',
            'frames_enabled'      => '1',
            'show_captions'       => '1',
            'show_guest_names'    => '1',
            'feature_enabled'     => '1',
            'max_upload_mb'       => 20,
            'refresh_seconds'     => 7,
            'feature_seconds'     => 25,
            'guest_eyebrow'        => 'Shannon + Alex',
            'guest_title'          => 'Capture the Magic',
            'guest_intro'          => 'Share the wedding through your eyes.',
            'upload_button_text'   => '📸 Take or Choose Photos',
            'live_title_text'      => 'Add to the Live Photo Wall ✨',
            'live_help_text'       => 'Uncheck this if you only want to send the photo to us.',
            'submit_button_text'   => 'Add to Our Album',
            'success_single_text'  => '✨ We got it! Your photo is in the wedding album.',
            'success_multi_text'   => '✨ We got them! {count} photos are in the wedding album.',
            'camera_page_url'      => '',
            'share_heading'        => 'Scan to Share Your Photos',
            'share_subtext'        => 'Add your photos to our Live Wall in seconds.',
        ];
    }

    private function settings() {
        $saved = get_option( self::OPTION_SETTINGS, [] );
        return wp_parse_args( is_array( $saved ) ? $saved : [], $this->default_settings() );
    }

    private function frames() {
        $frames = get_option( self::OPTION_FRAMES, [] );
        if ( ! is_array( $frames ) ) return [];

        $clean = [];
        foreach ( $frames as $frame ) {
            $id = isset( $frame['id'] ) ? absint( $frame['id'] ) : 0;
            if ( ! $id || ! wp_attachment_is_image( $id ) ) continue;
            $url = wp_get_attachment_image_url( $id, 'full' );
            if ( ! $url ) continue;
            $clean[] = [
                'id'    => $id,
                'label' => isset( $frame['label'] ) ? sanitize_text_field( $frame['label'] ) : 'Frame',
                'url'   => $url,
            ];
        }
        return $clean;
    }

    private function frame_by_id( $id ) {
        $id = absint( $id );
        if ( ! $id ) return null;
        foreach ( $this->frames() as $frame ) {
            if ( (int) $frame['id'] === $id ) return $frame;
        }
        return null;
    }

    /**
     * Finds published pages/posts that contain a given shortcode tag, so the
     * admin doesn't have to hand-type the camera page URL.
     */
    private function shortcode_pages( $tag ) {
        $candidates = get_posts( [
            'post_type'      => [ 'page', 'post' ],
            'post_status'    => 'publish',
            'posts_per_page' => 200,
            'orderby'        => 'title',
            'order'          => 'ASC',
        ] );

        $found = [];
        foreach ( $candidates as $post ) {
            if ( has_shortcode( (string) $post->post_content, $tag ) ) {
                $found[] = [
                    'id'    => $post->ID,
                    'title' => get_the_title( $post ),
                    'url'   => get_permalink( $post ),
                ];
            }
        }
        return $found;
    }

    private function camera_url() {
        $settings = $this->settings();
        if ( ! empty( $settings['camera_page_url'] ) ) {
            return esc_url_raw( $settings['camera_page_url'] );
        }
        $pages = $this->shortcode_pages( 'wedding_camera' );
        return ! empty( $pages ) ? $pages[0]['url'] : home_url( '/' );
    }

    public function register_assets() {
        wp_register_style( 'wcam', WCAM_URL . 'assets/wedding-camera.css', [], WCAM_VERSION );
        wp_register_script( 'wcam-camera', WCAM_URL . 'assets/camera.js', [], WCAM_VERSION, true );
        wp_register_script( 'wcam-wall', WCAM_URL . 'assets/live-wall.js', [], WCAM_VERSION, true );
        wp_register_script( 'wcam-qrlib', WCAM_URL . 'assets/qrcode.lib.js', [], WCAM_VERSION, true );
        wp_register_script( 'wcam-share', WCAM_URL . 'assets/share-qr.js', [ 'wcam-qrlib' ], WCAM_VERSION, true );

        // Enqueue as early as possible (in <head>) whenever the current page
        // actually contains one of our shortcodes. Enqueuing only from
        // inside the shortcode callback itself is too late for styles —
        // wp_head() has usually already printed by the time content renders
        // — so pages would silently render with no CSS at all.
        if ( is_singular() ) {
            $post = get_post();
            $content = $post ? (string) $post->post_content : '';
            if ( has_shortcode( $content, 'wedding_camera' ) ) {
                wp_enqueue_style( 'wcam' );
                wp_enqueue_script( 'wcam-camera' );
            }
            if ( has_shortcode( $content, 'wedding_photo_wall' ) ) {
                wp_enqueue_style( 'wcam' );
                wp_enqueue_script( 'wcam-wall' );
            }
            if ( has_shortcode( $content, 'wedding_camera_qr' ) ) {
                wp_enqueue_style( 'wcam' );
                wp_enqueue_script( 'wcam-qrlib' );
                wp_enqueue_script( 'wcam-share' );
            }
        }
    }

    /**
     * Prints the plugin stylesheet inline, once per page. This is a
     * belt-and-suspenders fallback for page builders/caching setups where
     * has_shortcode() can't see the shortcode in post_content (it's stored
     * as block/widget data instead), so styling never silently breaks.
     */
    private function inline_style_once() {
        static $printed = false;
        if ( $printed ) return '';
        $printed = true;
        $path = WCAM_PATH . 'assets/wedding-camera.css';
        if ( ! file_exists( $path ) ) return '';
        $css = file_get_contents( $path );
        if ( ! $css ) return '';
        return '<style id="wcam-inline-style">' . $css . '</style>';
    }

    /**
     * Prints a tiny inline script, once per page, that catches any
     * JavaScript error on the page (ours or a conflicting plugin/theme
     * script) and shows it in a visible on-page banner. This lets a
     * non-technical site owner see exactly what broke without opening
     * browser devtools — especially useful since a broken guest-camera
     * page tends to navigate away before anyone can read the console.
     */
    private function inline_debug_script_once() {
        static $printed = false;
        if ( $printed ) return '';
        $printed = true;
        return <<<'HTML'
<script id="wcam-debug-script">(function(){
  function banner(msg){
    try {
      var el = document.getElementById("wcam-debug-banner");
      if (!el) {
        el = document.createElement("div");
        el.id = "wcam-debug-banner";
        el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#8a3b3b;color:#fff;padding:10px 40px 10px 14px;font:13px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;white-space:pre-wrap;word-break:break-word;";
        var close = document.createElement("button");
        close.textContent = "×";
        close.setAttribute("aria-label", "Dismiss");
        close.style.cssText = "position:absolute;top:6px;right:10px;background:none;border:0;color:#fff;font-size:18px;line-height:1;cursor:pointer;";
        close.addEventListener("click", function(){ el.remove(); });
        el.appendChild(close);
        var text = document.createElement("div");
        text.id = "wcam-debug-banner-text";
        el.appendChild(text);
        (document.body || document.documentElement).appendChild(el);
      }
      var textEl = document.getElementById("wcam-debug-banner-text");
      textEl.textContent += (textEl.textContent ? "\n" : "") + msg;
    } catch (e) {}
  }
  window.addEventListener("error", function(e){
    banner("Page error: " + e.message + " (" + (e.filename || "") + ":" + (e.lineno || "") + ")");
  });
  window.addEventListener("unhandledrejection", function(e){
    var reason = e.reason && e.reason.message ? e.reason.message : e.reason;
    banner("Unhandled promise error: " + reason);
  });
})();</script>
HTML;
    }

    /**
     * Prints a tiny inline script, once per page, that always blocks the
     * native browser submit on the upload form — independent of whether
     * camera.js loads/attaches its own handler. Without this, a guest whose
     * browser never got the real upload script for any reason (blocked
     * request, conflicting plugin, etc.) would trigger a native form submit
     * that reloads the page with a useless "?photo=filename" in the URL and
     * silently loses their selected photos instead of just not uploading.
     */
    private function inline_submit_guard_once() {
        static $printed = false;
        if ( $printed ) return '';
        $printed = true;
        return <<<'HTML'
<script id="wcam-submit-guard">document.addEventListener("submit", function(e){
  if (e.target && e.target.id === "wcam-upload-form") e.preventDefault();
}, true);</script>
HTML;
    }

    public function admin_assets( $hook ) {
        if ( strpos( (string) $hook, 'wedding-camera' ) === false ) return;
        wp_enqueue_media();
        wp_enqueue_script( 'wcam-admin', WCAM_URL . 'assets/admin.js', [ 'jquery' ], WCAM_VERSION, true );
        wp_enqueue_style( 'wcam-admin', WCAM_URL . 'assets/admin.css', [], WCAM_VERSION );

        if ( strpos( (string) $hook, 'wedding-camera-share' ) !== false ) {
            wp_register_script( 'wcam-qrlib', WCAM_URL . 'assets/qrcode.lib.js', [], WCAM_VERSION, true );
            wp_register_script( 'wcam-share', WCAM_URL . 'assets/share-qr.js', [ 'wcam-qrlib' ], WCAM_VERSION, true );
            wp_enqueue_script( 'wcam-share' );
        }
    }

    public function register_routes() {
        register_rest_route( 'wedding-camera/v1', '/upload', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'upload_photo' ],
            'permission_callback' => '__return_true',
        ] );

        register_rest_route( 'wedding-camera/v1', '/live', [
            'methods'             => 'GET',
            'callback'            => [ $this, 'get_live_photos' ],
            'permission_callback' => '__return_true',
        ] );

        register_rest_route( 'wedding-camera/v1', '/mine/(?P<id>\d+)/live', [
            'methods'             => 'POST',
            'callback'            => [ $this, 'guest_toggle_live' ],
            'permission_callback' => '__return_true',
            'args'                => [
                'id' => [
                    'validate_callback' => function( $value ) {
                        return is_numeric( $value ) && (int) $value > 0;
                    },
                ],
            ],
        ] );
    }

    private function allowed_mimes() {
        return [
            'jpg|jpeg|jpe' => 'image/jpeg',
            'png'          => 'image/png',
            'webp'         => 'image/webp',
            'heic'         => 'image/heic',
            'heif'         => 'image/heif',
        ];
    }

    private function client_ip() {
        return isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : 'unknown';
    }

    private function rate_limit_ok() {
        $key = 'wcam_rl_' . md5( $this->client_ip() );
        $count = (int) get_transient( $key );
        if ( $count >= 30 ) return false;
        set_transient( $key, $count + 1, 10 * MINUTE_IN_SECONDS );
        return true;
    }

    public function upload_photo( WP_REST_Request $request ) {
        $settings = $this->settings();
        if ( $settings['uploads_open'] !== '1' ) {
            return new WP_Error( 'wcam_closed', 'Wedding photo uploads are currently closed.', [ 'status' => 403 ] );
        }

        if ( ! $this->rate_limit_ok() ) {
            return new WP_Error( 'wcam_rate_limit', 'Too many uploads. Please try again in a few minutes.', [ 'status' => 429 ] );
        }

        if ( empty( $_FILES['photo'] ) ) {
            return new WP_Error( 'wcam_missing_file', 'No photo was received.', [ 'status' => 400 ] );
        }

        $file = $_FILES['photo'];
        $max_mb = max( 1, min( 50, absint( $settings['max_upload_mb'] ) ) );
        if ( ! empty( $file['size'] ) && (int) $file['size'] > $max_mb * MB_IN_BYTES ) {
            return new WP_Error( 'wcam_too_large', sprintf( 'That photo is larger than %d MB.', $max_mb ), [ 'status' => 413 ] );
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $check = wp_check_filetype_and_ext( $file['tmp_name'], $file['name'], $this->allowed_mimes() );
        if ( empty( $check['type'] ) || strpos( $check['type'], 'image/' ) !== 0 ) {
            return new WP_Error( 'wcam_bad_type', 'Please upload an image file.', [ 'status' => 415 ] );
        }

        $attachment_id = media_handle_upload(
            'photo',
            0,
            [ 'post_title' => sanitize_text_field( pathinfo( $file['name'], PATHINFO_FILENAME ) ) ],
            [ 'test_form' => false, 'mimes' => $this->allowed_mimes() ]
        );
        if ( is_wp_error( $attachment_id ) ) return $attachment_id;

        $guest_name = sanitize_text_field( (string) $request->get_param( 'guest_name' ) );
        $caption    = sanitize_textarea_field( (string) $request->get_param( 'caption' ) );
        $live       = filter_var( $request->get_param( 'live' ), FILTER_VALIDATE_BOOLEAN );
        $frame_id   = absint( $request->get_param( 'frame_id' ) );

        if ( $settings['frames_enabled'] !== '1' || ! $this->frame_by_id( $frame_id ) ) $frame_id = 0;

        $token = wp_generate_password( 40, false, false );
        update_post_meta( $attachment_id, self::META_GUEST_NAME, $guest_name );
        update_post_meta( $attachment_id, self::META_CAPTION, $caption );
        update_post_meta( $attachment_id, self::META_LIVE, $live ? '1' : '0' );
        update_post_meta( $attachment_id, self::META_TOKEN_HASH, wp_hash_password( $token ) );
        update_post_meta( $attachment_id, self::META_GUEST, '1' );
        update_post_meta( $attachment_id, self::META_FRAME_ID, $frame_id );

        $frame = $this->frame_by_id( $frame_id );
        return rest_ensure_response( [
            'id'        => $attachment_id,
            'token'     => $token,
            'live'      => $live,
            'thumbnail' => wp_get_attachment_image_url( $attachment_id, 'medium' ),
            'frame_id'  => $frame_id,
            'frame_url' => $frame ? $frame['url'] : '',
        ] );
    }

    public function get_live_photos() {
        $query = new WP_Query( [
            'post_type'      => 'attachment',
            'post_status'    => 'inherit',
            'post_mime_type' => 'image',
            'posts_per_page' => 100,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'meta_query'     => [
                'relation' => 'AND',
                [ 'key' => self::META_GUEST, 'value' => '1' ],
                [ 'key' => self::META_LIVE, 'value' => '1' ],
            ],
        ] );

        $photos = array_map( function( $post ) {
            $frame_id = absint( get_post_meta( $post->ID, self::META_FRAME_ID, true ) );
            $frame = $this->frame_by_id( $frame_id );
            return [
                'id'         => $post->ID,
                'url'        => wp_get_attachment_image_url( $post->ID, 'large' ),
                'thumbnail'  => wp_get_attachment_image_url( $post->ID, 'medium_large' ),
                'guest_name' => get_post_meta( $post->ID, self::META_GUEST_NAME, true ),
                'caption'    => get_post_meta( $post->ID, self::META_CAPTION, true ),
                'frame_id'   => $frame_id,
                'frame_url'  => $frame ? $frame['url'] : '',
                'date'       => get_the_date( 'c', $post->ID ),
            ];
        }, $query->posts );

        return rest_ensure_response( [ 'photos' => $photos ] );
    }

    public function guest_toggle_live( WP_REST_Request $request ) {
        $id    = absint( $request['id'] );
        $token = sanitize_text_field( (string) $request->get_param( 'token' ) );
        $live  = filter_var( $request->get_param( 'live' ), FILTER_VALIDATE_BOOLEAN );
        $hash  = get_post_meta( $id, self::META_TOKEN_HASH, true );

        if ( ! $hash || ! $token || ! wp_check_password( $token, $hash ) ) {
            return new WP_Error( 'wcam_forbidden', 'You cannot change this photo.', [ 'status' => 403 ] );
        }

        update_post_meta( $id, self::META_LIVE, $live ? '1' : '0' );
        return rest_ensure_response( [ 'id' => $id, 'live' => $live ] );
    }

    public function camera_shortcode() {
        $settings = $this->settings();
        $frames = $settings['frames_enabled'] === '1' ? $this->frames() : [];

        $config = [
            'uploadUrl'     => esc_url_raw( rest_url( 'wedding-camera/v1/upload' ) ),
            'toggleBaseUrl' => esc_url_raw( rest_url( 'wedding-camera/v1/mine/' ) ),
            'defaultLive'   => $settings['default_live'] === '1',
            'uploadsOpen'   => $settings['uploads_open'] === '1',
            'frames'        => $frames,
            'successSingle' => $settings['success_single_text'],
            'successMulti'  => $settings['success_multi_text'],
        ];

        wp_enqueue_style( 'wcam' );
        wp_enqueue_script( 'wcam-camera' );
        // wp_localize_script() alone has proven unreliable on some hosts
        // (its <script>var WeddingCamera=...</script> block can silently
        // fail to print), so the same data is also printed inline below as
        // the guaranteed source of truth.
        wp_localize_script( 'wcam-camera', 'WeddingCamera', $config );

        ob_start(); ?>
        <?php echo $this->inline_debug_script_once(); ?>
        <?php echo $this->inline_submit_guard_once(); ?>
        <script id="wcam-camera-config">var WeddingCamera = <?php echo wp_json_encode( $config ); ?>;</script>
        <?php echo $this->inline_style_once(); ?>
        <div class="wcam-app" id="wcam-app">
            <section class="wcam-hero">
                <p class="wcam-kicker"><?php echo esc_html( $settings['guest_eyebrow'] ); ?></p>
                <h1><?php echo esc_html( $settings['guest_title'] ); ?></h1>
                <p><?php echo esc_html( $settings['guest_intro'] ); ?></p>
            </section>

            <?php if ( $settings['uploads_open'] !== '1' ) : ?>
                <div class="wcam-card wcam-closed"><h2>Thank you for sharing the magic ✨</h2><p>Photo uploads are currently closed.</p></div>
            <?php else : ?>
            <form class="wcam-card" id="wcam-upload-form">
                <div class="wcam-capture-choices">
                    <button type="button" id="wcam-open-camera" class="wcam-upload-button wcam-camera-trigger" hidden>
                        <span>📷 Take a Photo</span>
                    </button>
                    <label class="wcam-upload-button wcam-gallery-trigger">
                        <span><?php echo esc_html( $settings['upload_button_text'] ); ?></span>
                        <input id="wcam-files" type="file" name="photo" accept="image/*" multiple required>
                    </label>
                </div>

                <div id="wcam-camera-panel" class="wcam-camera-panel" hidden>
                    <div class="wcam-camera-viewport">
                        <video id="wcam-camera-video" playsinline autoplay muted></video>
                        <canvas id="wcam-camera-canvas" hidden></canvas>
                    </div>
                    <p id="wcam-camera-error" class="wcam-camera-error" hidden></p>
                    <div class="wcam-camera-controls">
                        <button type="button" id="wcam-camera-switch" class="wcam-mini-button" hidden>🔄 Switch Camera</button>
                        <button type="button" id="wcam-camera-shutter" class="wcam-shutter" aria-label="Take photo"></button>
                        <button type="button" id="wcam-camera-close" class="wcam-mini-button">Close</button>
                    </div>
                    <div id="wcam-camera-shots" class="wcam-camera-shots"></div>
                    <button type="button" id="wcam-camera-done" class="wcam-submit" hidden>Use These Photos</button>
                </div>

                <div id="wcam-preview" class="wcam-preview" hidden></div>

                <?php if ( ! empty( $frames ) ) : ?>
                <fieldset class="wcam-frame-picker" id="wcam-frame-picker">
                    <legend>Add a frame <small>(optional)</small></legend>
                    <p class="wcam-frame-help">Your original photo stays untouched — the frame can be changed later.</p>
                    <div class="wcam-frame-options">
                        <label class="wcam-frame-option is-selected">
                            <input type="radio" name="wcam_frame" value="0" checked>
                            <span class="wcam-frame-none">No Frame</span>
                        </label>
                        <?php foreach ( $frames as $frame ) : ?>
                        <label class="wcam-frame-option">
                            <input type="radio" name="wcam_frame" value="<?php echo esc_attr( $frame['id'] ); ?>" data-frame-url="<?php echo esc_url( $frame['url'] ); ?>">
                            <span class="wcam-frame-thumb"><img src="<?php echo esc_url( $frame['url'] ); ?>" alt=""></span>
                            <strong><?php echo esc_html( $frame['label'] ); ?></strong>
                        </label>
                        <?php endforeach; ?>
                    </div>
                </fieldset>
                <?php endif; ?>

                <label class="wcam-field"><span>Your name <small>(optional)</small></span><input id="wcam-name" type="text" maxlength="80" autocomplete="name"></label>
                <label class="wcam-field"><span>Caption <small>(optional)</small></span><textarea id="wcam-caption" maxlength="240" rows="3"></textarea></label>

                <label class="wcam-live-choice">
                    <input id="wcam-live" type="checkbox" <?php checked( $settings['default_live'], '1' ); ?>>
                    <span><strong><?php echo esc_html( $settings['live_title_text'] ); ?></strong><small><?php echo esc_html( $settings['live_help_text'] ); ?></small></span>
                </label>

                <button class="wcam-submit" type="submit"><?php echo esc_html( $settings['submit_button_text'] ); ?></button>
                <p id="wcam-status" class="wcam-status" aria-live="polite"></p>
            </form>
            <?php endif; ?>

            <section id="wcam-my-photos" class="wcam-my-photos" hidden>
                <h2>My Photos</h2>
                <p>You can change whether your uploads appear on the Live Photo Wall.</p>
                <div id="wcam-my-photo-grid" class="wcam-my-photo-grid"></div>
            </section>
        </div>
        <?php return ob_get_clean();
    }

    public function wall_shortcode( $atts = [] ) {
        $settings = $this->settings();
        $atts = shortcode_atts( [
            'camera_url' => '',
            'qr_image'   => '',
            'eyebrow'    => 'Shannon + Alex',
            'title'      => 'The Wedding Through Your Eyes',
            'date'       => '10 · 16 · 26',
        ], $atts, 'wedding_photo_wall' );

        $config = [
            'liveUrl'         => esc_url_raw( rest_url( 'wedding-camera/v1/live' ) ),
            'featureEveryMs'  => max( 10, absint( $settings['feature_seconds'] ) ) * 1000,
            'refreshEveryMs'  => max( 3, absint( $settings['refresh_seconds'] ) ) * 1000,
            'featureEnabled'  => $settings['feature_enabled'] === '1',
            'showCaptions'    => $settings['show_captions'] === '1',
            'showGuestNames'  => $settings['show_guest_names'] === '1',
        ];

        wp_enqueue_style( 'wcam' );
        wp_enqueue_script( 'wcam-wall' );
        wp_localize_script( 'wcam-wall', 'WeddingWall', $config );

        ob_start(); ?>
        <?php echo $this->inline_debug_script_once(); ?>
        <script id="wcam-wall-config">var WeddingWall = <?php echo wp_json_encode( $config ); ?>;</script>
        <?php echo $this->inline_style_once(); ?>
        <div class="wcam-wall" id="wcam-wall">
            <header class="wcam-wall-header"><p><?php echo esc_html( $atts['eyebrow'] ); ?></p><h1><?php echo esc_html( $atts['title'] ); ?></h1><span><?php echo esc_html( $atts['date'] ); ?></span></header>
            <div class="wcam-wall-topbar">
                <div class="wcam-wall-count"><strong id="wcam-photo-count">0</strong><span>photos shared</span></div>
                <?php if ( $atts['camera_url'] || $atts['qr_image'] ) : ?>
                <aside class="wcam-qr-card">
                    <?php if ( $atts['qr_image'] ) : ?><img src="<?php echo esc_url( $atts['qr_image'] ); ?>" alt="QR code to add wedding photos"><?php endif; ?>
                    <div><strong>Share your view ✨</strong><span>Scan to add your photos</span><?php if ( $atts['camera_url'] ) : ?><small><?php echo esc_html( preg_replace('#^https?://#', '', $atts['camera_url']) ); ?></small><?php endif; ?></div>
                </aside>
                <?php endif; ?>
            </div>
            <div id="wcam-wall-grid" class="wcam-wall-grid"></div>
            <div id="wcam-wall-empty" class="wcam-wall-empty"><strong>The photo wall is waking up ✨</strong><span>Scan the wedding QR code to add the first photo.</span></div>
            <div id="wcam-feature" class="wcam-feature" hidden aria-hidden="true">
                <div class="wcam-feature-backdrop"></div>
                <figure class="wcam-feature-card">
                    <div class="wcam-feature-media"><img id="wcam-feature-image" class="wcam-photo-image" alt="Featured wedding guest photo"><img id="wcam-feature-frame" class="wcam-photo-frame" alt="" hidden></div>
                    <figcaption id="wcam-feature-caption"></figcaption>
                </figure>
            </div>
        </div>
        <?php return ob_get_clean();
    }

    /**
     * Printable / on-screen QR share card. Use `copies` to print a sheet of
     * table cards (e.g. copies="6") and `url` to point at any page other
     * than the auto-detected camera page.
     */
    public function qr_shortcode( $atts = [] ) {
        $settings = $this->settings();
        $atts = shortcode_atts( [
            'url'     => '',
            'heading' => $settings['share_heading'],
            'subtext' => $settings['share_subtext'],
            'eyebrow' => $settings['guest_eyebrow'],
            'copies'  => 1,
            'size'    => 220,
        ], $atts, 'wedding_camera_qr' );

        $url    = $atts['url'] ? esc_url_raw( $atts['url'] ) : $this->camera_url();
        $copies = max( 1, min( 12, absint( $atts['copies'] ) ) );
        $size   = max( 120, min( 480, absint( $atts['size'] ) ) );

        wp_enqueue_style( 'wcam' );
        wp_enqueue_script( 'wcam-qrlib' );
        wp_enqueue_script( 'wcam-share' );

        ob_start(); ?>
        <?php echo $this->inline_debug_script_once(); ?>
        <?php echo $this->inline_style_once(); ?>
        <div class="wcam-qr-sheet">
            <?php for ( $i = 0; $i < $copies; $i++ ) : ?>
            <div class="wcam-qr-card">
                <p class="wcam-kicker"><?php echo esc_html( $atts['eyebrow'] ); ?></p>
                <h2><?php echo esc_html( $atts['heading'] ); ?></h2>
                <div class="wcam-qr-canvas-wrap">
                    <canvas class="wcam-qr-canvas" data-url="<?php echo esc_attr( $url ); ?>" width="<?php echo esc_attr( $size ); ?>" height="<?php echo esc_attr( $size ); ?>"></canvas>
                </div>
                <p class="wcam-qr-subtext"><?php echo esc_html( $atts['subtext'] ); ?></p>
                <p class="wcam-qr-link"><?php echo esc_html( preg_replace( '#^https?://#', '', $url ) ); ?></p>
            </div>
            <?php endfor; ?>
        </div>
        <?php return ob_get_clean();
    }

    public function admin_menu() {
        add_menu_page( 'Wedding Camera', 'Wedding Camera', 'upload_files', 'wedding-camera', [ $this, 'admin_page' ], 'dashicons-camera-alt', 26 );
        add_submenu_page( 'wedding-camera', 'Photos', 'Photos', 'upload_files', 'wedding-camera', [ $this, 'admin_page' ] );
        add_submenu_page( 'wedding-camera', 'Settings & Frames', 'Settings & Frames', 'manage_options', 'wedding-camera-settings', [ $this, 'settings_page' ] );
        add_submenu_page( 'wedding-camera', 'Share & QR', 'Share & QR', 'manage_options', 'wedding-camera-share', [ $this, 'share_page' ] );
    }

    private function guest_photos() {
        return get_posts( [
            'post_type'      => 'attachment',
            'post_status'    => 'inherit',
            'post_mime_type' => 'image',
            'posts_per_page' => 500,
            'orderby'        => 'date',
            'order'          => 'DESC',
            'meta_key'       => self::META_GUEST,
            'meta_value'     => '1',
        ] );
    }

    public function admin_page() {
        if ( ! current_user_can( 'upload_files' ) ) wp_die( esc_html__( 'You do not have permission to view this page.' ) );
        $photos = $this->guest_photos();
        $frames = $this->frames();
        $filter = isset( $_GET['filter'] ) ? sanitize_key( $_GET['filter'] ) : 'all';

        $counts = [ 'all' => count( $photos ), 'live' => 0, 'private' => 0, 'favorites' => 0 ];
        foreach ( $photos as $p ) {
            $is_live = get_post_meta( $p->ID, self::META_LIVE, true ) === '1';
            $is_fav  = get_post_meta( $p->ID, self::META_FAVORITE, true ) === '1';
            $counts[ $is_live ? 'live' : 'private' ]++;
            if ( $is_fav ) $counts['favorites']++;
        }
        ?>
        <div class="wrap wcam-admin-wrap">
            <h1>Wedding Camera</h1>
            <p>Manage every guest upload. Frames are reversible overlays — changing or removing one never changes the original photo.</p>
            <nav class="wcam-admin-filters">
                <?php foreach ( [ 'all'=>'All', 'live'=>'Live', 'private'=>'Private', 'favorites'=>'Favorites' ] as $key=>$label ) : ?>
                <a class="button <?php echo $filter === $key ? 'button-primary' : ''; ?>" href="<?php echo esc_url( admin_url( 'admin.php?page=wedding-camera&filter=' . $key ) ); ?>"><?php echo esc_html( $label . ' (' . $counts[$key] . ')' ); ?></a>
                <?php endforeach; ?>
                <a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=wedding-camera-settings' ) ); ?>">⚙ Settings & Frames</a>
            </nav>
            <div class="wcam-admin-grid">
                <?php foreach ( $photos as $photo ) :
                    $live = get_post_meta( $photo->ID, self::META_LIVE, true ) === '1';
                    $favorite = get_post_meta( $photo->ID, self::META_FAVORITE, true ) === '1';
                    if ( $filter === 'live' && ! $live ) continue;
                    if ( $filter === 'private' && $live ) continue;
                    if ( $filter === 'favorites' && ! $favorite ) continue;
                    $name = get_post_meta( $photo->ID, self::META_GUEST_NAME, true );
                    $caption = get_post_meta( $photo->ID, self::META_CAPTION, true );
                    $frame_id = absint( get_post_meta( $photo->ID, self::META_FRAME_ID, true ) );
                    $frame = $this->frame_by_id( $frame_id );
                    $toggle_url = wp_nonce_url( admin_url( 'admin-post.php?action=wcam_toggle_live&id=' . $photo->ID ), 'wcam_toggle_' . $photo->ID );
                    $favorite_url = wp_nonce_url( admin_url( 'admin-post.php?action=wcam_toggle_favorite&id=' . $photo->ID ), 'wcam_favorite_' . $photo->ID );
                    $delete_url = wp_nonce_url( admin_url( 'admin-post.php?action=wcam_delete_photo&id=' . $photo->ID ), 'wcam_delete_' . $photo->ID );
                ?>
                <article class="wcam-admin-card">
                    <div class="wcam-admin-image-wrap"><?php echo wp_get_attachment_image( $photo->ID, 'medium' ); ?><?php if ( $frame ) : ?><img class="wcam-admin-frame" src="<?php echo esc_url( $frame['url'] ); ?>" alt=""><?php endif; ?></div>
                    <div class="wcam-admin-body">
                        <div class="wcam-admin-badges"><span class="wcam-badge <?php echo $live ? 'is-live' : ''; ?>"><?php echo $live ? 'LIVE' : 'PRIVATE'; ?></span><?php if ( $favorite ) : ?><span class="wcam-badge">♥ FAVORITE</span><?php endif; ?></div>
                        <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                            <input type="hidden" name="action" value="wcam_update_photo"><input type="hidden" name="id" value="<?php echo esc_attr( $photo->ID ); ?>"><?php wp_nonce_field( 'wcam_update_' . $photo->ID ); ?>
                            <p><input class="regular-text" name="guest_name" value="<?php echo esc_attr( $name ); ?>" placeholder="Guest name"></p>
                            <p><textarea name="caption" rows="2" maxlength="240" placeholder="Caption"><?php echo esc_textarea( $caption ); ?></textarea></p>
                            <?php if ( ! empty( $frames ) ) : ?><p><select name="frame_id"><option value="0">No frame</option><?php foreach ( $frames as $fr ) : ?><option value="<?php echo esc_attr( $fr['id'] ); ?>" <?php selected( $frame_id, $fr['id'] ); ?>><?php echo esc_html( $fr['label'] ); ?></option><?php endforeach; ?></select></p><?php endif; ?>
                            <button class="button" type="submit">Save details</button>
                        </form>
                        <div class="wcam-admin-actions">
                            <a class="button <?php echo $live ? 'button-primary' : ''; ?>" href="<?php echo esc_url( $toggle_url ); ?>"><?php echo $live ? '✓ Live' : 'Add to Live'; ?></a>
                            <a class="button <?php echo $favorite ? 'button-primary' : ''; ?>" href="<?php echo esc_url( $favorite_url ); ?>"><?php echo $favorite ? '♥ Favorite' : '♡ Favorite'; ?></a>
                            <a class="button" href="<?php echo esc_url( wp_get_attachment_url( $photo->ID ) ); ?>" target="_blank" rel="noopener">Original</a>
                            <a class="button button-link-delete" href="<?php echo esc_url( $delete_url ); ?>" onclick="return confirm('Delete this upload permanently?')">Delete</a>
                        </div>
                    </div>
                </article>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    public function settings_page() {
        if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Not allowed.' );
        $s = $this->settings();
        $frames = $this->frames();
        ?>
        <div class="wrap wcam-settings-wrap">
            <h1>Wedding Camera — Settings & Frames</h1>
            <?php if ( isset( $_GET['saved'] ) ) : ?><div class="notice notice-success is-dismissible"><p>Wedding Camera settings saved.</p></div><?php endif; ?>
            <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
                <input type="hidden" name="action" value="wcam_save_settings"><?php wp_nonce_field( 'wcam_save_settings' ); ?>

                <section class="wcam-settings-card">
                    <h2>Guest Page Text</h2>
                    <p>Customize the wording guests see on the camera page without editing the shortcode or plugin files.</p>
                    <label class="wcam-setting-row"><span>Eyebrow / names</span><input type="text" class="regular-text" name="guest_eyebrow" maxlength="100" value="<?php echo esc_attr( $s['guest_eyebrow'] ); ?>"></label>
                    <label class="wcam-setting-row"><span>Main heading</span><input type="text" class="regular-text" name="guest_title" maxlength="120" value="<?php echo esc_attr( $s['guest_title'] ); ?>"></label>
                    <label class="wcam-setting-row"><span>Intro text</span><textarea class="large-text" rows="2" name="guest_intro" maxlength="300"><?php echo esc_textarea( $s['guest_intro'] ); ?></textarea></label>
                    <label class="wcam-setting-row"><span>Upload button</span><input type="text" class="regular-text" name="upload_button_text" maxlength="120" value="<?php echo esc_attr( $s['upload_button_text'] ); ?>"></label>
                    <label class="wcam-setting-row"><span>Live checkbox title</span><input type="text" class="regular-text" name="live_title_text" maxlength="160" value="<?php echo esc_attr( $s['live_title_text'] ); ?>"></label>
                    <label class="wcam-setting-row"><span>Live checkbox helper</span><textarea class="large-text" rows="2" name="live_help_text" maxlength="300"><?php echo esc_textarea( $s['live_help_text'] ); ?></textarea></label>
                    <label class="wcam-setting-row"><span>Submit button</span><input type="text" class="regular-text" name="submit_button_text" maxlength="120" value="<?php echo esc_attr( $s['submit_button_text'] ); ?>"></label>
                    <label class="wcam-setting-row"><span>Success message — one photo</span><input type="text" class="large-text" name="success_single_text" maxlength="220" value="<?php echo esc_attr( $s['success_single_text'] ); ?>"></label>
                    <label class="wcam-setting-row"><span>Success message — multiple photos</span><input type="text" class="large-text" name="success_multi_text" maxlength="220" value="<?php echo esc_attr( $s['success_multi_text'] ); ?>"><small>Use <code>{count}</code> where you want the number of uploaded photos to appear.</small></label>
                </section>

                <section class="wcam-settings-card">
                    <h2>Guest Uploads</h2>
                    <label class="wcam-setting-toggle"><input type="checkbox" name="uploads_open" value="1" <?php checked( $s['uploads_open'], '1' ); ?>><span><strong>Uploads are open</strong><small>Turn this off after the wedding whenever you want to stop new uploads.</small></span></label>
                    <label class="wcam-setting-toggle"><input type="checkbox" name="default_live" value="1" <?php checked( $s['default_live'], '1' ); ?>><span><strong>Live Photo Wall checked by default</strong><small>Guests can still uncheck it before uploading.</small></span></label>
                    <label class="wcam-setting-row"><span>Maximum upload size</span><input type="number" min="1" max="50" name="max_upload_mb" value="<?php echo esc_attr( $s['max_upload_mb'] ); ?>"><small>MB per photo (your server may impose a lower limit).</small></label>
                </section>

                <section class="wcam-settings-card">
                    <h2>Live Wall</h2>
                    <label class="wcam-setting-toggle"><input type="checkbox" name="show_captions" value="1" <?php checked( $s['show_captions'], '1' ); ?>><span><strong>Show captions</strong></span></label>
                    <label class="wcam-setting-toggle"><input type="checkbox" name="show_guest_names" value="1" <?php checked( $s['show_guest_names'], '1' ); ?>><span><strong>Show guest names</strong></span></label>
                    <label class="wcam-setting-toggle"><input type="checkbox" name="feature_enabled" value="1" <?php checked( $s['feature_enabled'], '1' ); ?>><span><strong>Featured photo moments</strong><small>Periodically enlarges one random live photo.</small></span></label>
                    <label class="wcam-setting-row"><span>Refresh wall every</span><input type="number" min="3" max="60" name="refresh_seconds" value="<?php echo esc_attr( $s['refresh_seconds'] ); ?>"><small>seconds</small></label>
                    <label class="wcam-setting-row"><span>Feature a photo every</span><input type="number" min="10" max="300" name="feature_seconds" value="<?php echo esc_attr( $s['feature_seconds'] ); ?>"><small>seconds</small></label>
                </section>

                <section class="wcam-settings-card">
                    <h2>Guest Frames</h2>
                    <label class="wcam-setting-toggle"><input type="checkbox" name="frames_enabled" value="1" <?php checked( $s['frames_enabled'], '1' ); ?>><span><strong>Let guests add frames</strong><small>Frames are saved as overlays, not baked into the original photo.</small></span></label>
                    <p><strong>Canva tip:</strong> export each frame as a PNG with a transparent center/background. Keep important decoration near the edges.</p>
                    <div id="wcam-frame-rows" class="wcam-frame-rows">
                        <?php foreach ( $frames as $frame ) : ?>
                        <div class="wcam-frame-row">
                            <div class="wcam-frame-preview"><img src="<?php echo esc_url( $frame['url'] ); ?>" alt=""></div>
                            <input type="hidden" class="wcam-frame-id" name="frame_ids[]" value="<?php echo esc_attr( $frame['id'] ); ?>">
                            <input type="text" class="wcam-frame-label" name="frame_labels[]" maxlength="50" value="<?php echo esc_attr( $frame['label'] ); ?>" placeholder="Frame name">
                            <button type="button" class="button wcam-choose-frame">Replace PNG</button>
                            <button type="button" class="button-link-delete wcam-remove-frame">Remove</button>
                        </div>
                        <?php endforeach; ?>
                    </div>
                    <button type="button" class="button button-secondary" id="wcam-add-frame">+ Add Canva Frame</button>
                </section>

                <?php submit_button( 'Save Wedding Camera Settings' ); ?>
            </form>

            <template id="wcam-frame-template">
                <div class="wcam-frame-row">
                    <div class="wcam-frame-preview"><span>No PNG selected</span></div>
                    <input type="hidden" class="wcam-frame-id" name="frame_ids[]" value="">
                    <input type="text" class="wcam-frame-label" name="frame_labels[]" maxlength="50" value="" placeholder="Frame name">
                    <button type="button" class="button wcam-choose-frame">Choose PNG</button>
                    <button type="button" class="button-link-delete wcam-remove-frame">Remove</button>
                </div>
            </template>
        </div>
        <?php
    }

    public function share_page() {
        if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Not allowed.' );
        $s     = $this->settings();
        $pages = $this->shortcode_pages( 'wedding_camera' );
        $url   = $this->camera_url();
        ?>
        <div class="wrap wcam-settings-wrap wcam-share-wrap">
            <h1>Wedding Camera — Share & QR</h1>
            <?php if ( isset( $_GET['saved'] ) ) : ?><div class="notice notice-success is-dismissible"><p>Wedding Camera settings saved.</p></div><?php endif; ?>
            <p>Get guests to the camera page with a QR code they can scan, or an NFC tag they can tap.</p>

            <div class="wcam-share-columns">
                <form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="wcam-settings-card">
                    <input type="hidden" name="action" value="wcam_save_share"><?php wp_nonce_field( 'wcam_save_share' ); ?>

                    <h2>Camera Page</h2>
                    <?php if ( $pages ) : ?>
                        <p>Pages found using <code>[wedding_camera]</code>:</p>
                        <ul class="wcam-detected-pages">
                            <?php foreach ( $pages as $p ) : ?>
                            <li><strong><?php echo esc_html( $p['title'] ); ?></strong> — <code><?php echo esc_html( $p['url'] ); ?></code></li>
                            <?php endforeach; ?>
                        </ul>
                    <?php else : ?>
                        <p>No published page with <code>[wedding_camera]</code> was found yet. Add that shortcode to a page, or set the URL manually below.</p>
                    <?php endif; ?>
                    <label class="wcam-setting-row"><span>Camera page URL</span><input type="url" class="regular-text" name="camera_page_url" value="<?php echo esc_attr( $s['camera_page_url'] ); ?>" placeholder="<?php echo esc_attr( $pages ? $pages[0]['url'] : home_url( '/' ) ); ?>"></label>
                    <small>Leave blank to auto-use the first detected page above.</small>

                    <h2>Share Card Text</h2>
                    <label class="wcam-setting-row"><span>Heading</span><input type="text" class="regular-text" name="share_heading" maxlength="120" value="<?php echo esc_attr( $s['share_heading'] ); ?>"></label>
                    <label class="wcam-setting-row"><span>Subtext</span><textarea class="large-text" rows="2" name="share_subtext" maxlength="200"><?php echo esc_textarea( $s['share_subtext'] ); ?></textarea></label>

                    <?php submit_button( 'Save' ); ?>
                </form>

                <div class="wcam-settings-card wcam-share-preview">
                    <h2>Preview & Download</h2>
                    <div class="wcam-qr-canvas-wrap">
                        <canvas id="wcam-admin-qr-canvas" data-url="<?php echo esc_attr( $url ); ?>" width="240" height="240"></canvas>
                    </div>
                    <p class="wcam-qr-link"><code id="wcam-admin-qr-url"><?php echo esc_html( $url ); ?></code></p>
                    <div class="wcam-share-actions">
                        <button type="button" class="button" id="wcam-copy-link">Copy Link</button>
                        <button type="button" class="button button-primary" id="wcam-download-qr">Download QR (PNG)</button>
                    </div>
                    <p><strong>Tip:</strong> Add <code>[wedding_camera_qr]</code> to any page for a printable share card, or <code>[wedding_camera_qr copies="6"]</code> to print a sheet of table cards.</p>

                    <h2>NFC Tags <small>(optional)</small></h2>
                    <p id="wcam-nfc-support-note"></p>
                    <button type="button" class="button" id="wcam-nfc-write" hidden>📲 Write NFC Tag</button>
                    <p id="wcam-nfc-status" aria-live="polite"></p>
                    <p class="wcam-nfc-fallback">No built-in NFC writer on this device? Use a free app like "NFC Tools" to write this same link to your tags:<br><code><?php echo esc_html( $url ); ?></code></p>
                </div>
            </div>
        </div>
        <?php
    }

    public function admin_save_settings() {
        if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Not allowed.' );
        check_admin_referer( 'wcam_save_settings' );

        $settings = [
            'uploads_open'     => isset( $_POST['uploads_open'] ) ? '1' : '0',
            'default_live'     => isset( $_POST['default_live'] ) ? '1' : '0',
            'frames_enabled'   => isset( $_POST['frames_enabled'] ) ? '1' : '0',
            'show_captions'    => isset( $_POST['show_captions'] ) ? '1' : '0',
            'show_guest_names' => isset( $_POST['show_guest_names'] ) ? '1' : '0',
            'feature_enabled'  => isset( $_POST['feature_enabled'] ) ? '1' : '0',
            'max_upload_mb'    => max( 1, min( 50, absint( $_POST['max_upload_mb'] ?? 20 ) ) ),
            'refresh_seconds'  => max( 3, min( 60, absint( $_POST['refresh_seconds'] ?? 7 ) ) ),
            'feature_seconds'  => max( 10, min( 300, absint( $_POST['feature_seconds'] ?? 25 ) ) ),
            'guest_eyebrow'       => sanitize_text_field( wp_unslash( $_POST['guest_eyebrow'] ?? 'Shannon + Alex' ) ),
            'guest_title'         => sanitize_text_field( wp_unslash( $_POST['guest_title'] ?? 'Capture the Magic' ) ),
            'guest_intro'         => sanitize_textarea_field( wp_unslash( $_POST['guest_intro'] ?? 'Share the wedding through your eyes.' ) ),
            'upload_button_text'  => sanitize_text_field( wp_unslash( $_POST['upload_button_text'] ?? '📸 Take or Choose Photos' ) ),
            'live_title_text'     => sanitize_text_field( wp_unslash( $_POST['live_title_text'] ?? 'Add to the Live Photo Wall ✨' ) ),
            'live_help_text'      => sanitize_textarea_field( wp_unslash( $_POST['live_help_text'] ?? 'Uncheck this if you only want to send the photo to us.' ) ),
            'submit_button_text'  => sanitize_text_field( wp_unslash( $_POST['submit_button_text'] ?? 'Add to Our Album' ) ),
            'success_single_text' => sanitize_text_field( wp_unslash( $_POST['success_single_text'] ?? '✨ We got it! Your photo is in the wedding album.' ) ),
            'success_multi_text'  => sanitize_text_field( wp_unslash( $_POST['success_multi_text'] ?? '✨ We got them! {count} photos are in the wedding album.' ) ),
        ];
        update_option( self::OPTION_SETTINGS, $settings, false );

        $ids = isset( $_POST['frame_ids'] ) && is_array( $_POST['frame_ids'] ) ? array_map( 'absint', wp_unslash( $_POST['frame_ids'] ) ) : [];
        $labels = isset( $_POST['frame_labels'] ) && is_array( $_POST['frame_labels'] ) ? array_map( 'sanitize_text_field', wp_unslash( $_POST['frame_labels'] ) ) : [];
        $frames = [];
        foreach ( $ids as $i => $id ) {
            if ( ! $id || ! wp_attachment_is_image( $id ) ) continue;
            $frames[] = [ 'id' => $id, 'label' => ! empty( $labels[$i] ) ? $labels[$i] : 'Frame ' . ( count( $frames ) + 1 ) ];
            if ( count( $frames ) >= 12 ) break;
        }
        update_option( self::OPTION_FRAMES, $frames, false );

        wp_safe_redirect( admin_url( 'admin.php?page=wedding-camera-settings&saved=1' ) );
        exit;
    }

    /**
     * Saves just the Share & QR fields, merged into existing settings so this
     * smaller form never clobbers the toggles/text set on the main page.
     */
    public function admin_save_share() {
        if ( ! current_user_can( 'manage_options' ) ) wp_die( 'Not allowed.' );
        check_admin_referer( 'wcam_save_share' );

        $settings = $this->settings();
        $settings['camera_page_url'] = isset( $_POST['camera_page_url'] ) ? esc_url_raw( wp_unslash( $_POST['camera_page_url'] ) ) : '';
        $settings['share_heading']   = isset( $_POST['share_heading'] ) ? sanitize_text_field( wp_unslash( $_POST['share_heading'] ) ) : $settings['share_heading'];
        $settings['share_subtext']   = isset( $_POST['share_subtext'] ) ? sanitize_textarea_field( wp_unslash( $_POST['share_subtext'] ) ) : $settings['share_subtext'];
        update_option( self::OPTION_SETTINGS, $settings, false );

        wp_safe_redirect( admin_url( 'admin.php?page=wedding-camera-share&saved=1' ) );
        exit;
    }

    public function admin_toggle_live() {
        $id = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
        if ( ! $id || ! current_user_can( 'upload_files' ) ) wp_die( 'Not allowed.' );
        check_admin_referer( 'wcam_toggle_' . $id );
        $live = get_post_meta( $id, self::META_LIVE, true ) === '1';
        update_post_meta( $id, self::META_LIVE, $live ? '0' : '1' );
        wp_safe_redirect( wp_get_referer() ?: admin_url( 'admin.php?page=wedding-camera' ) ); exit;
    }

    public function admin_toggle_favorite() {
        $id = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
        if ( ! $id || ! current_user_can( 'upload_files' ) ) wp_die( 'Not allowed.' );
        check_admin_referer( 'wcam_favorite_' . $id );
        $favorite = get_post_meta( $id, self::META_FAVORITE, true ) === '1';
        update_post_meta( $id, self::META_FAVORITE, $favorite ? '0' : '1' );
        wp_safe_redirect( wp_get_referer() ?: admin_url( 'admin.php?page=wedding-camera' ) ); exit;
    }

    public function admin_update_photo() {
        $id = isset( $_POST['id'] ) ? absint( $_POST['id'] ) : 0;
        if ( ! $id || ! current_user_can( 'upload_files' ) ) wp_die( 'Not allowed.' );
        check_admin_referer( 'wcam_update_' . $id );
        update_post_meta( $id, self::META_GUEST_NAME, isset( $_POST['guest_name'] ) ? sanitize_text_field( wp_unslash( $_POST['guest_name'] ) ) : '' );
        update_post_meta( $id, self::META_CAPTION, isset( $_POST['caption'] ) ? sanitize_textarea_field( wp_unslash( $_POST['caption'] ) ) : '' );
        $frame_id = isset( $_POST['frame_id'] ) ? absint( $_POST['frame_id'] ) : 0;
        if ( $frame_id && ! $this->frame_by_id( $frame_id ) ) $frame_id = 0;
        update_post_meta( $id, self::META_FRAME_ID, $frame_id );
        wp_safe_redirect( wp_get_referer() ?: admin_url( 'admin.php?page=wedding-camera' ) ); exit;
    }

    public function admin_delete_photo() {
        $id = isset( $_GET['id'] ) ? absint( $_GET['id'] ) : 0;
        if ( ! $id || ! current_user_can( 'delete_posts' ) ) wp_die( 'Not allowed.' );
        check_admin_referer( 'wcam_delete_' . $id );
        wp_delete_attachment( $id, true );
        wp_safe_redirect( wp_get_referer() ?: admin_url( 'admin.php?page=wedding-camera' ) ); exit;
    }
}

new Wedding_Camera();
