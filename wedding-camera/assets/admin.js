jQuery(function($) {
  const rows = $('#wcam-frame-rows');
  const template = document.getElementById('wcam-frame-template');

  $('#wcam-add-frame').on('click', function() {
    if (!template) return;
    rows.append(template.content.cloneNode(true));
  });

  rows.on('click', '.wcam-remove-frame', function() {
    $(this).closest('.wcam-frame-row').remove();
  });

  rows.on('click', '.wcam-choose-frame', function() {
    const button = $(this);
    const row = button.closest('.wcam-frame-row');
    const media = wp.media({ title: 'Choose a transparent PNG frame', button: { text: 'Use this frame' }, multiple: false, library: { type: 'image' } });
    media.on('select', function() {
      const attachment = media.state().get('selection').first().toJSON();
      row.find('.wcam-frame-id').val(attachment.id);
      row.find('.wcam-frame-preview').html($('<img>', { src: attachment.url, alt: '' }));
      if (!row.find('.wcam-frame-label').val()) row.find('.wcam-frame-label').val(attachment.title || 'Wedding Frame');
      button.text('Replace PNG');
    });
    media.open();
  });
});
