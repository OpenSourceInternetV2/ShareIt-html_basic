Blob.slice = Blob.slice || Blob.webkitSlice || Blob.mozSlice
if(Blob.slice != undefined)
	alert("It won't work in your browser. Please use Chrome or Firefox.");

// Filereader support (be able to host files from the filesystem)
if(typeof FileReader == "undefined")
	oldBrowser();


var chunksize = 65536


function Bitmap(size)
{
  var bitmap = new Array(size)
  for(var i=0; i<size; i++)
    bitmap[i] = i;
  return bitmap
}

function getRandom(bitmap)
{
  return bitmap[Math.floor(Math.random() * bitmap.length)]
}

function remove(bitmap, item)
{
  bitmap.splice(bitmap.indexOf(item), 1)
}

function Host_init(db, onsuccess)
{
	var host = {}

	// Peer

	host.files_list = function(files)
	{
		// Check if we have already any of the files
		// It's stupid to try to download it... and also give errors
		db.sharepoints_getAll(null, function(filelist)
		{
			for(var i=0, file; file = files[i]; i++)
				for(var j=0, file_hosted; file_hosted = filelist[j]; j++)
					if(file.name == file_hosted.name)
					{
						file.bitmap = file_hosted.bitmap
						file.blob   = file_hosted.blob || file_hosted

						break;
					}
	
			ui_updatefiles_peer(files)
		})
	}

	if(onsuccess)
		onsuccess(host);

	// Host

	host.peer_connected = function(socket_id)
	{
		ui_peerstate("Peer connected!");

		db.sharepoints_getAll(null, host._send_files_list)

		info(socket_id + " joined!");
	}
	
	host.peer_disconnected = function(data)
	{
		ui_peerstate("Peer disconnected.");
	}

	// Filereader support (be able to host files from the filesystem)
	if(typeof FileReader == "undefined")
	{
		console.warn("'Filereader' is not available, can't be able to host files");
		host.transfer_query_chunk = function(filename, chunk){}
	}
	else
		host.transfer_query_chunk = function(filename, chunk)
		{
			var reader = new FileReader();
				reader.onerror = function(evt)
				{
					console.error("host.transfer_query_chunk("+filename+", "+chunk+") = '"+evt.target.result+"'")
				}
				reader.onload = function(evt)
				{
					connection.transfer_send_chunk(filename, chunk, evt.target.result);
				}

			var start = chunk * chunksize;
			var stop  = start + chunksize;

			db.sharepoints_get(filename, function(file)
			{
				var filesize = parseInt(file.size);
				if(stop > filesize)
					stop = filesize;

				reader.readAsBinaryString(file.slice(start, stop));
			})
		}

	// Peer

	function _savetodisk(file)
	{
		// Auto-save downloaded file
	    var save = document.createElement("A");
	    	save.href = window.URL.createObjectURL(file.blob)
	    	save.target = "_blank"		// This can give problems...
			save.download = file.name	// This force to download with a filename instead of navigate
	
		var evt = document.createEvent('MouseEvents');
			evt.initMouseEvent('click', true, true, window, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
	
		save.dispatchEvent(evt);

		window.URL.revokeObjectURL(save.href)
	}

	host.transfer_send_chunk = function(filename, chunk, data)
	{
		db.sharepoints_get(filename, function(file)
		{
			remove(file.bitmap, chunk)

	        // Update blob
			var start = chunk * chunksize;
			var stop  = start + chunksize;

			var byteArray = new Uint8Array(data.length);
            for(var i = 0; i < data.length; i++)
                byteArray[i] = data.charCodeAt(i) & 0xff;

	        var blob = file.blob
	        var head = blob.slice(0, start)
	        var padding = start-head.size
	        if(padding < 0)
	        	padding = 0;
//	        console.debug("chunk: "+chunk+", head.size: "+head.size+", padding: "+padding)
		    file.blob = new Blob([head, ArrayBuffer(padding), byteArray.buffer, blob.slice(stop)],
		    					 {"type": blob.type})

			var pending_chunks = file.bitmap.length
			if(pending_chunks)
			{
				var chunks = file.size/chunksize;
				if(chunks % 1 != 0)
					chunks = Math.floor(chunks) + 1;

			    ui_filedownloading(file.name, chunks - pending_chunks);

			    // Demand more data from one of the pending chunks
		        db.sharepoints_put(file, function()
		        {
				    connection.transfer_query_chunk(file.name, getRandom(file.bitmap));
				})
			}
			else
			{
				// There are no more chunks, set file as fully downloaded
				delete file.bitmap;

		        db.sharepoints_put(file, function()
		        {
				    // Auto-save downloaded file
				    _savetodisk(file)

				    ui_filedownloaded(file);
		        })
			}
		})
	}

	host._send_files_list = function(filelist)
	{
		var files_send = []

		for(var i = 0, file; file = filelist[i]; i++)
			files_send.push({"name": file.name, "size": file.size, "type": file.type});

		connection.files_list(files_send);
	}

    host._transferbegin = function(file, onsuccess)
    {
        // Calc number of necesary chunks to download
        var chunks = file.size/chunksize;
        if(chunks % 1 != 0)
            chunks = Math.floor(chunks) + 1;

        // Add a blob container and a bitmap to our file stub
        file.blob = new Blob([''], {"type": file.type})
        file.bitmap = Bitmap(chunks)

        // Insert new "file" inside IndexedDB
        db.sharepoints_add(file,
        function(key)
        {
            if(onsuccess)
                onsuccess(chunks);

            console.log("Transfer begin: '"+key+"' = "+JSON.stringify(file))

            // Demand data from the begining of the file
            connection.transfer_query_chunk(key, getRandom(file.bitmap))
        },
        function(errorCode)
        {
            console.error("Transfer begin: '"+file.name+"' is already in database.")
        })
    }

	if(onsuccess)
		onsuccess();
}