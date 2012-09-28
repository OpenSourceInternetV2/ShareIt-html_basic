function Transport_Room_init(transport, onsuccess)
{
    transport.addEventListener('joiner.success', function()
    {
        transport.addEventListener('peer.connected', function(socket_id)
        {
            ui_peerstate("Peer connected!");

            db.sharepoints_getAll(null, transport._send_files_list)

            console.info(socket_id + " joined!");
        })

        transport.addEventListener('peer.disconnected', function(data)
        {
            ui_peerstate("Peer disconnected.");
        })

        if(onsuccess)
            onsuccess()
    })

    transport.addEventListener('joiner.error', function(type)
    {
        switch(type)
        {
            case 'room full':
                console.warn("This connection is full. Please try later.");
        }
    })
}