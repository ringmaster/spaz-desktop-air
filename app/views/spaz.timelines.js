var Spaz; if (!Spaz){ Spaz = {}; }

if (!Spaz.Timelines){ Spaz.Timelines = {}; }


/**
 * options used for makeClickable calls 
 */
var SPAZ_MAKECLICKABLE_OPTS = {
	'autolink': {
		'type'		:'both',
		'extra_code':'',
		'maxlen'	:100
	},
	'screenname': {
		'tpl':'<span class="user-screen-name clickable" title="View user\'s profile" user-screen_name="#username#">@#username#</span>' // should contain macro '#username#'
	},
	'hashtag': {
		'tpl':'<span class="hashtag clickable" title="Search for this hashtag" data-hashtag="#hashtag_enc#">##hashtag#</span>' // should contain macros '#hashtag#' and '#hashtag_enc#'
	}
};


/**
 * The string prefix for a "not these" filter
 */
var NEGATION_TOKEN = "not:";

/**
 * The AppTimeline is defined here so we can inherit its prototype below 
 */
var AppTimeline = function() {};


AppTimeline.prototype.model = {
	'items' : []
};

/**
 * This is just a wrapper to start the SpazTimeline object contained within 
 */
AppTimeline.prototype.activate = function() {
	this.timeline.start();
};

/**
 * filter the timeline (hide or show entries) based on a string of terms
 * @param {string} terms 
 */
AppTimeline.prototype.filter = function(terms) {
	var entry_selector = this.getEntrySelector();
	sch.dump(entry_selector);
	var jqentries = jQuery(entry_selector);
	jqentries.removeClass('hidden');

	if (terms) {
		try {
			var negate = false;
			if (terms.substring(0, NEGATION_TOKEN.length).toLowerCase() === NEGATION_TOKEN) {
				negate = true;
				terms  = terms.slice(NEGATION_TOKEN.length);
			}
			var filter_re = new RegExp(sch.trim(terms), "i");
			sch.dump(filter_re.toString());
			jqentries.each(function(i) {
				var jqthis = jQuery(this);
				if (negate) {
					if ( jqthis.text().search(filter_re) > -1 ) {
						jqthis.addClass('hidden');
					}
				} else {
					if ( jqthis.text().search(filter_re) === -1 ) {
						jqthis.addClass('hidden');
					}
				}
			});
		} catch(e) {
			sch.debug(e.name+":"+e.message);
		}
	}

};

AppTimeline.prototype.clear = function() {
	var entry_selector = this.getEntrySelector();
	$(entry_selector).remove();
};


AppTimeline.prototype.markAsRead = function() {
	var entry_selector = this.getEntrySelector();

	/* we use our own "mark as read" here because the helper version just removes the 'new' class' */
	$(entry_selector+':visible').removeClass('new').addClass('read').each(function(i){
		var status_id = $(this).attr('data-status-id');
		Spaz.DB.markEntryAsRead(status_id);
	});
	$().trigger('UNREAD_COUNT_CHANGED');

};

AppTimeline.prototype.getEntrySelector = function() {
	return this.getTimelineSelector()+' div.timeline-entry';
};

AppTimeline.prototype.getWrapperSelector = function() {
	return this.getTimelineSelector().replace('timeline-', 'timelinewrapper-');
};

AppTimeline.prototype.getTimelineSelector = function() {
	return this.timeline.timeline_container_selector;
};

AppTimeline.prototype.sortByAttribute = function(sortattr, idattr, sortfunc) {

	var items = jQuery( this.getEntrySelector() ),
		itemAttrs	= [],
		itemsSorted = [],
		sortedHTML	= '';
	sortfunc = sortfunc || function(a,b){return b.sortval - a.sortval;};

	(function(){
		var i, iMax, $item, attrobj;
		for (i = 0, iMax = items.length; i < iMax; i++){
			$item = jQuery(items[i]);
			attrobj = {
				id:			$item.attr(idattr),
				sortval:	$item.attr(sortattr)
			};
			itemAttrs.push(attrobj);
		}
	})();

	itemAttrs.sort( sortfunc );

	(function(){
		var i, iMax, attrobj, selector, $item, itemHTML;
		for (i = 0, iMax = itemAttrs.length; i < iMax; i++){
			attrobj = itemAttrs[i];
			selector = this.getEntrySelector()+"["+idattr+"=" + attrobj.id + "]";
			// sch.error(selector);
			$item = jQuery(selector);
			// sch.error($item.length);
			itemHTML = $item.get(0).outerHTML;
			// sch.error(itemHTML);
			itemsSorted.push(itemHTML);
		}
	})();
	
	sortedHTML = '<div>'+itemsSorted.join('')+'</div>';
	
	jQuery(this.getTimelineSelector()).html(sortedHTML);
};

AppTimeline.prototype.refresh = function() {
	sch.error('refreshing timeline');
	this.timeline.refresh();
};


/**
 * Friends timeline def 
 */
var FriendsTimeline = function() {

	var thisFT			 = this,
		$timeline		 = $('#timeline-friends'),
		$timelineWrapper = $timeline.parent();
	this.twit  = new SpazTwit();
	this.shurl = new SpazShortURL();

	var maxFT = {
		'home': Spaz.Prefs.get('timeline-home-pager-count-max'),
		'direct': Spaz.Prefs.get('timeline-direct-pager-count-max'),
		'replies': Spaz.Prefs.get('timeline-replies-pager-count-max')
	};

	/*
		set up the Friends timeline
	*/
	this.timeline  = new SpazTimeline({
		'timeline_container_selector' : $timeline.selector,
		'entry_relative_time_selector':'.status-created-at',
		
		'success_event':'new_combined_timeline_data',
		'failure_event':'error_combined_timeline_data',
		'event_target' :document,
		
		'refresh_time':Spaz.Prefs.get('network-refreshinterval'),
		'max_items': (maxFT.home + maxFT.direct + maxFT.replies),

		'request_data': function() {
			sch.dump('REQUESTING DATA FOR FRIENDS TIMELINE =====================');
			sch.markAllAsRead($timeline.selector + ' div.timeline-entry'); // just add .read to the entries

			var count = {
				'home': Spaz.Prefs.get('timeline-home-pager-count'),
				'direct': Spaz.Prefs.get('timeline-direct-pager-count'),
				'replies': Spaz.Prefs.get('timeline-replies-pager-count')
			};

			var com_opts = {
				'home_count': (count.home > maxFT.home ? maxFT.home : count.home),
				'dm_count': (count.direct > maxFT.direct ? maxFT.direct : count.direct),
				'replies_count': (count.replies > maxFT.replies ? maxFT.replies : count.replies)
			};
			
			
			thisFT.twit.setCredentials(Spaz.Prefs.getAuthObject());
			sch.error('thisFT.twit.username:'+thisFT.twit.username);
			sch.error('thisFT.twit.auth:'+sch.enJSON(thisFT.twit.auth));
			thisFT.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
			thisFT.twit.getCombinedTimeline(com_opts);
			Spaz.UI.statusBar("Loading friends timeline");
			Spaz.UI.showLoading();
			
			sch.dump('REQUEST_DATA');
		},
		'data_success': function(e, data) {
			
			sch.dump('DATA_SUCCESS');
			
			data = data.reverse();
			var i, iMax,
				no_dupes = [],
				sui = new SpazImageURL(),
				dataItem;

			sch.dump(data);
			
			for (i = 0, iMax = data.length; i < iMax; i++){
				dataItem = data[i];
				sch.dump(i);

				if (dataItem.SC_is_retweet) {
					dataItem.id = dataItem.retweeted_status.id;
				}
				/*
					only add if it doesn't already exist
				*/
				if ($timeline.find('div.timeline-entry[data-status-id='+dataItem.id+']').length<1) {
					
					// nl2br
					dataItem.text = sch.nl2br(dataItem.text);
					
					// add thumbnails
					dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.text);
					
					// make clickable
					dataItem.text = sch.makeClickable(dataItem.text, SPAZ_MAKECLICKABLE_OPTS);
					
					// convert emoticons
					dataItem.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.text);
					
					// check if entry has been read
					dataItem.SC_is_read = !!Spaz.DB.isRead(dataItem.id);
					
					sch.debug(i +' is ' + dataItem.SC_is_read);
					
					if (dataItem.SC_is_retweet) {
						// nl2br
						dataItem.retweeted_status.text = sch.nl2br(dataItem.retweeted_status.text);

						// add thumbnails
						dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.retweeted_status.text);

						// make clickable
						dataItem.retweeted_status.text = sch.makeClickable(dataItem.retweeted_status.text, SPAZ_MAKECLICKABLE_OPTS);

						// convert emoticons
						dataItem.retweeted_status.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.retweeted_status.text);
					}
					
					no_dupes.push(dataItem);
					
					/*
						Save to DB via JazzRecord
					*/
					TweetModel.saveTweet(dataItem);
					
				}
				
			}
			

			/*
				Record old scroll position
			*/
			var $oldFirst, offset_before;
			$oldFirst	  = $timeline.find('div.timeline-entry:first');
			if ($oldFirst.length > 0) {
			    offset_before = $oldFirst.offset().top;
			}
				

			/*
				Add new items
			*/
			$timelineWrapper.children('.loading, .new-user').hide();
			thisFT.timeline.addItems(no_dupes);

			/*
				sort timeline
			*/
			var before = new Date();
			
			// don't sort if we don't have anything new!
			if (no_dupes.length > 0) {
				// get first of new times
				var new_first_time = no_dupes[0].SC_created_at_unixtime;
				// get last of new times
				var new_last_time  = no_dupes[no_dupes.length-1].SC_created_at_unixtime;
				// get first of OLD times
				var old_first_time = parseInt($oldFirst.attr('data-timestamp'), 10);
				// sort if either first new or last new is OLDER than the first old
				if (new_first_time < old_first_time || new_last_time < old_first_time) {
					$('div.timeline-entry', $timeline).tsort({attr:'data-timestamp', place:'orig', order:'desc'});					
				} else {
					sch.error('Didn\'t resort…');
				}

			}
			var after = new Date();
			var total = new Date();
			total.setTime(after.getTime() - before.getTime());
			sch.error('Sorting took ' + total.getMilliseconds() + 'ms');				
			

			sch.note('notify of new entries!');
			Spaz.UI.notifyOfNewEntries(no_dupes);

			/*
				expand URLs
			*/
			// var exp_urls = [];
			// for (var i=0; i < no_dupes.length; i++) {
			//	urls = thisFT.shurl.findExpandableURLs(no_dupes[i].text);
			//	if (urls) {
			//		exp_urls = exp_urls.concat(urls);
			//	}
			// };
			// 
			// thisFT.shurl.expandURLs(exp_urls, thisFT.timeline.container);

			$('div.timeline-entry.new div.status-text', thisFT.timeline.container).each(function(i) {
				var urls = thisFT.shurl.findExpandableURLs(this.innerHTML);
				if (urls) {
					sch.debug(urls);
					sch.debug(this.innerHTML);
					sch.listen(this, sc.events.newExpandURLSuccess, thisFT.expandURL);
					thisFT.shurl.expandURLs(urls, this);
				}
			});


			/*
				set new scroll position
			*/
			if (offset_before) {
			    var offset_after = $oldFirst.offset().top;
    			var offset_diff = Math.abs(offset_before - offset_after);
    			if ($timelineWrapper.scrollTop() > 0) {
    				$timelineWrapper.scrollTop( $timelineWrapper.scrollTop() + offset_diff );
    			}
			}

			/*
				reapply filtering
			*/
			$('#filter-friends').trigger('keyup');
			
			sch.updateRelativeTimes($timeline.selector + ' .status-created-at', 'data-created-at');
			
			/*
				get new set of usernames
			*/
			Spaz.Autocomplete.initSuggestions();
			
			Spaz.UI.hideLoading();
			Spaz.UI.statusBar("Ready");
			

		},
		'data_failure': function(e, error_obj) {
			sch.dump('DATA_FAILURE');
			var err_msg = "There was an error retrieving your timeline";
			Spaz.UI.statusBar(err_msg);

			/*
				Update relative dates
			*/
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			Spaz.UI.hideLoading();
		},
		'renderer': function(obj) {
			if (obj.SC_is_dm) {
				return Spaz.Tpl.parse('timeline_entry_dm', obj);
			} else {
				return Spaz.Tpl.parse('timeline_entry', obj);
			}
			
			
		}
	});
	
	/*
		override the default method
	*/
	this.timeline.removeExtraItems = function() {
		var sel = $timeline.selector;
		sch.removeExtraElements(sel + ' div.timeline-entry:not(.reply):not(.dm)', Spaz.Prefs.get('timeline-home-pager-count'));
		sch.removeExtraElements(sel + ' div.timeline-entry.reply', Spaz.Prefs.get('timeline-replies-pager-count'));
		sch.removeExtraElements(sel + ' div.timeline-entry.dm', Spaz.Prefs.get('timeline-direct-pager-count'));
	};

	
	/*
		handler for URL expansion
	*/
	this.expandURL = function(e, data) {
		
		var el = e.target;
		sch.unlisten(el, sc.events.newExpandURLSuccess, thisFT.expandURL);

		sch.debug('expanding…');
		sch.debug(data);
		el.innerHTML = thisFT.shurl.replaceExpandableURL(el.innerHTML, data.shorturl, data.longurl);
	};

	/*
		listener for URL expansion
	*/
	sch.listen(this.timeline.container, sc.events.newExpandURLSuccess, this.expandURL);
};

FriendsTimeline.prototype = new AppTimeline();

FriendsTimeline.prototype.reset = function() {
	sch.debug('reset friends timeline');

};







/**
 * Public timeline def 
 */
var PublicTimeline = function(args) {
	
	var thisPT			 = this,
		$timeline		 = $('#timeline-public'),
		$timelineWrapper = $timeline.parent();
	this.twit = new SpazTwit();
	
	/*
		set up the public timeline
	*/
	this.timeline  = new SpazTimeline({
		'timeline_container_selector' : $timeline.selector,
		'entry_relative_time_selector':'.status-created-at',
		
		'success_event':'new_public_timeline_data',
		'failure_event':'error_public_timeline_data',
		'event_target' :document,
		
		'refresh_time':1000*60*30, // 30 minutes
		'max_items':100,

		'request_data': function() {
			thisPT.markAsRead($timeline.selector + ' div.timeline-entry');
			thisPT.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
			thisPT.twit.setCredentials(Spaz.Prefs.getAuthObject());
			thisPT.twit.getPublicTimeline();
			Spaz.UI.statusBar("Loading public timeline");
			Spaz.UI.showLoading();
		},
		'data_success': function(e, data) {
			data = data.reverse();
			var i, iMax,
				no_dupes = [],
				sui = new SpazImageURL(),
				dataItem; // "datum"?

			for (i = 0, iMax = data.length; i < iMax; i++){
				dataItem = data[i];

				/*
					only add if it doesn't already exist
				*/
				if ($timeline.find('div.timeline-entry[data-status-id='+dataItem.id+']').length<1) {

					// nl2br
					dataItem.text = sch.nl2br(dataItem.text);

					dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.text);

					dataItem.text = sch.makeClickable(dataItem.text, SPAZ_MAKECLICKABLE_OPTS);

					// convert emoticons
					dataItem.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.text);
					
					if (dataItem.SC_is_retweet) {
						// nl2br
						dataItem.retweeted_status.text = sch.nl2br(dataItem.retweeted_status.text);

						// add thumbnails
						dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.retweeted_status.text);

						// make clickable
						dataItem.retweeted_status.text = sch.makeClickable(dataItem.retweeted_status.text, SPAZ_MAKECLICKABLE_OPTS);

						// convert emoticons
						dataItem.retweeted_status.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.retweeted_status.text);
					}

					no_dupes.push(dataItem);
					/*
						Save to DB via JazzRecord
					*/
					TweetModel.saveTweet(dataItem);
				}

			}

			$timelineWrapper.children('.loading').hide();
			thisPT.timeline.addItems(no_dupes);

			/*
				reapply filtering
			*/
			$('#filter-public').trigger('keyup');

			sch.markAllAsRead($timeline.selector + ' div.timeline-entry'); // public are never "new"
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');

			Spaz.UI.hideLoading();
			Spaz.UI.statusBar("Ready");

		},
		'data_failure': function(e, error_obj) {
			var err_msg = "There was an error retrieving the public timeline";
			Spaz.UI.statusBar(err_msg);

			/*
				Update relative dates
			*/
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			Spaz.UI.hideLoading();
		},
		'renderer': function(obj) {
			return Spaz.Tpl.parse('timeline_entry', obj);

		}
	});




};

PublicTimeline.prototype = new AppTimeline();





/**
 * Public timeline def 
 */
var FavoritesTimeline = function(args) {

	var thisFVT			 = this,
		$timeline		 = $('#timeline-favorites'),
		$timelineWrapper = $timeline.parent();
	this.twit = new SpazTwit();

	/*
		set up the public timeline
	*/
	this.timeline  = new SpazTimeline({
		'timeline_container_selector' : $timeline.selector,
		'entry_relative_time_selector':'.status-created-at',

		'success_event':'new_favorites_timeline_data',
		'failure_event':'error_favorites_timeline_data',
		'event_target' :document,

		'refresh_time':1000*60*30, // 30 minutes
		'max_items':100,

		'request_data': function() {
			thisFVT.markAsRead($timeline.selector + ' div.timeline-entry');
			thisFVT.twit.setCredentials(Spaz.Prefs.getAuthObject());
			thisFVT.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
			thisFVT.twit.getFavorites();
			Spaz.UI.statusBar("Loading favorites timeline");
			Spaz.UI.showLoading();
		},
		'data_success': function(e, data) {
			data = data.reverse();
			var i, iMax,
				no_dupes = [],
				sui = new SpazImageURL(),
				dataItem;

			for (i = 0, iMax = data.length; i < iMax; i++){
				dataItem = data[i];

				/*
					only add if it doesn't already exist
				*/
				if ($timeline.find('div.timeline-entry[data-status-id='+dataItem.id+']').length<1) {

					// nl2br
					dataItem.text = sch.nl2br(dataItem.text);

					dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.text);

					dataItem.text = sch.makeClickable(dataItem.text, SPAZ_MAKECLICKABLE_OPTS);

					// convert emoticons
					dataItem.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.text);

					if (dataItem.SC_is_retweet) {
						// nl2br
						dataItem.retweeted_status.text = sch.nl2br(dataItem.retweeted_status.text);

						// add thumbnails
						dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.retweeted_status.text);

						// make clickable
						dataItem.retweeted_status.text = sch.makeClickable(dataItem.retweeted_status.text, SPAZ_MAKECLICKABLE_OPTS);

						// convert emoticons
						dataItem.retweeted_status.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.retweeted_status.text);
					}

					no_dupes.push(dataItem);
					/*
						Save to DB via JazzRecord
					*/
					TweetModel.saveTweet(dataItem);
				}

			}

			$timelineWrapper.children('.loading, .new-user').hide();
			thisFVT.timeline.addItems(no_dupes);

			/*
				reapply filtering
			*/
			$('#filter-favorites').trigger('keyup');


			sch.markAllAsRead($timeline.selector + ' div.timeline-entry'); // favorites are never "new"
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');

			Spaz.UI.hideLoading();
			Spaz.UI.statusBar("Ready");

		},
		'data_failure': function(e, error_obj) {
			var err_msg = "There was an error retrieving the favorites timeline";
			Spaz.UI.statusBar(err_msg);

			/*
				Update relative dates
			*/
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			Spaz.UI.hideLoading();
		},
		'renderer': function(obj) {
			return Spaz.Tpl.parse('timeline_entry', obj);
		}
	});
};

FavoritesTimeline.prototype = new AppTimeline();





/**
 * User timeline def 
 */
var UserTimeline = function(args) {

	var thisUT			 = this,
		$timeline		 = $('#timeline-user'),
		$timelineWrapper = $timeline.parent();
	this.twit = new SpazTwit();

	var maxUT = Spaz.Prefs.get('timeline-user-pager-count-max');

	/*
		set up the user timeline
	*/
	this.timeline  = new SpazTimeline({
		'timeline_container_selector' : $timeline.selector,
		'entry_relative_time_selector':'.status-created-at',
		
		'success_event':'new_user_timeline_data',
		'failure_event':'error_user_timeline_data',
		'event_target' :document,
		
		'refresh_time':1000*60*30, // 30 minutes
		'max_items': maxUT,

		'request_data': function() {
			thisUT.markAsRead($timeline.selector + ' div.timeline-entry');

			var countmax = thisUT.timeline.max_items;
			var count = Spaz.Prefs.get('timeline-user-pager-count');
			count = (count > maxUT ? maxUT : count);

			thisUT.twit.setCredentials(Spaz.Prefs.getAuthObject());
			var username = Spaz.Prefs.getUsername();
			sch.error('username in UserTimeline is '+username);
			thisUT.twit.getUserTimeline(username, count);
			Spaz.UI.statusBar("Loading user timeline");
			Spaz.UI.showLoading();
		},
		'data_success': function(e, data) {
			data = data.reverse();
			var i, iMax,
				no_dupes = [],
				sui = new SpazImageURL(),
				dataItem;
			
			for (i = 0, iMax = data.length; i < iMax; i++){
				dataItem = data[i];
				
				/*
					only add if it doesn't already exist
				*/
				if ($timeline.find('div.timeline-entry[data-status-id='+dataItem.id+']').length<1) {
					
					// nl2br
					dataItem.text = sch.nl2br(dataItem.text);
					
					dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.text);
					
					dataItem.text = sch.makeClickable(dataItem.text, SPAZ_MAKECLICKABLE_OPTS);
					
					// convert emoticons
					dataItem.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.text);
					
					if (dataItem.SC_is_retweet) {
						// nl2br
						dataItem.retweeted_status.text = sch.nl2br(dataItem.retweeted_status.text);

						// add thumbnails
						dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.retweeted_status.text);

						// make clickable
						dataItem.retweeted_status.text = sch.makeClickable(dataItem.retweeted_status.text, SPAZ_MAKECLICKABLE_OPTS);

						// convert emoticons
						dataItem.retweeted_status.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.retweeted_status.text);
					}
					
					no_dupes.push(dataItem);
					/*
						Save to DB via JazzRecord
					*/
					TweetModel.saveTweet(dataItem);
				}
				
			}

			$timelineWrapper.children('.loading, .new-user').hide();
			thisUT.timeline.addItems(no_dupes);

			/*
			 reapply filtering
			*/
			$('#filter-user').trigger('keyup');


			sch.markAllAsRead($timeline.selector + ' div.timeline-entry'); // user is never "new"
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');

			Spaz.UI.hideLoading();
			Spaz.UI.statusBar("Ready");
			
		},
		'data_failure': function(e, error_obj) {
			var err_msg = "There was an error retrieving the user timeline";
			Spaz.UI.statusBar(err_msg);

			/*
				Update relative dates
			*/
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			Spaz.UI.hideLoading();
		},
		'renderer': function(obj) {
			return Spaz.Tpl.parse('timeline_entry', obj);
			
		}
	});
	
	
	
};

UserTimeline.prototype = new AppTimeline();





/**
 * User timeline def 
 */
var UserlistsTimeline = function(args) {

	var thisULT			 = this,
		$timeline		 = $('#timeline-userlists'),
		$timelineWrapper = $timeline.parent();
	
	this.twit = new SpazTwit();
	
	this.list = {
		'user':null,
		'slug':null
	};
	
	/**
	 * @param {string} slug the list slug
	 * @param {string} user the user who owns the list 
	 */
	this.setlist = function(slug, user) {
		if (slug != this.list.slug || user != this.list.user) {
			$(this.timeline.timeline_container_selector).empty();
		}
		
		this.list.user = user;
		this.list.slug = slug;
		
		
		
		this.timeline.start();
	};
	
	/*
		set up the userlists timeline
	*/
	this.timeline  = new SpazTimeline({
		'timeline_container_selector' : $timeline.selector,
		'entry_relative_time_selector':'.status-created-at',
		
		'success_event':'get_list_timeline_succeeded',
		'failure_event':'get_list_timeline_failed',
		'event_target' :document,
		
		'refresh_time':1000*60*5, // 30 minutes
		'max_items':300,

		'request_data': function() {

			thisULT.markAsRead($timeline.selector + ' div.timeline-entry');
						
			if (thisULT.list.user && thisULT.list.slug) {
				// Give UI feedback immediately
				$('#timeline-userlists-full-name').text("@"+thisULT.list.user+'/'+thisULT.list.slug);
				if($timeline.is(':empty')){
					$timelineWrapper.children('.loading').show();
				}
				$timelineWrapper.children('.intro').hide();

				thisULT.twit.setCredentials(Spaz.Prefs.getAuthObject());
				thisULT.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
				thisULT.twit.getListTimeline(thisULT.list.slug, thisULT.list.user);
				Spaz.UI.statusBar("Getting list @"+thisULT.list.user+'/'+thisULT.list.slug + "…");
				Spaz.UI.showLoading();
			}
			
			
		},
		'data_success': function(e, data) {
			
			sch.debug('statuses:'+data.statuses);
			sch.debug('user:'+data.user);
			sch.debug('slug:'+data.slug);
			
			// data.statuses = data.statuses.reverse();
			var no_dupes = [];
			
			var sui = new SpazImageURL(),
				status;
			
			for (var i = 0, iMax = data.statuses.length; i < iMax; i++) {
				status = data.statuses[i];
				
				/*
					only add if it doesn't already exist
				*/
				if ($timeline.find('div.timeline-entry[data-status-id='+status.id+']').length<1) {
					sch.debug('div.timeline-entry[data-status-id='+status.id+'] does not exist… adding');
					
					// nl2br
					status.text = sch.nl2br(status.text);
					status.SC_thumbnail_urls = sui.getThumbsForUrls(status.text);
					status.text = sch.makeClickable(status.text, SPAZ_MAKECLICKABLE_OPTS);
					
					// convert emoticons
					data.statuses[i].text = Emoticons.SimpleSmileys.convertEmoticons(data.statuses[i].text);
					status.text = Emoticons.SimpleSmileys.convertEmoticons(status.text);
					
					if (status.SC_is_retweet) {
						// nl2br
						data[i].retweeted_status.text = sch.nl2br(data[i].retweeted_status.text);

						// add thumbnails
						status.SC_thumbnail_urls = sui.getThumbsForUrls(data[i].retweeted_status.text);

						// make clickable
						data[i].retweeted_status.text = sch.makeClickable(data[i].retweeted_status.text, SPAZ_MAKECLICKABLE_OPTS);

						// convert emoticons
						data[i].retweeted_status.text = Emoticons.SimpleSmileys.convertEmoticons(data[i].retweeted_status.text);
					}
					
					no_dupes.push(status);
					/*
						Save to DB via JazzRecord
					*/
					TweetModel.saveTweet(status);
				} else {
					sch.debug(status.id+' already exists');
				}
				
			}

			$timelineWrapper.children('.loading, .new-user, .intro').hide();
			thisULT.timeline.addItems(no_dupes);

			/*
			 reapply filtering
			*/
			$('#filter-userlists').trigger('keyup');
			
			
			sch.markAllAsRead($timeline.selector + ' div.timeline-entry'); // user is never "new"
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			
			Spaz.UI.hideLoading();
			Spaz.UI.statusBar("Ready");
			
		},
		'data_failure': function(e, error_obj) {
			var err_msg = "There was an error retrieving the userlists timeline";
			Spaz.UI.statusBar(err_msg);
			
			/*
				Update relative dates
			*/
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			Spaz.UI.hideLoading();
		},
		'renderer': function(obj) {
			return Spaz.Tpl.parse('timeline_entry', obj);
			
		}
	});
	
	
	
	this.buildListsMenu = function() {
		var auth = Spaz.Prefs.getAuthObject();
		var username = Spaz.Prefs.getUsername();
		thisULT.twit.setCredentials(auth);
		sch.error('settoing base URL');
		thisULT.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
		sch.debug("Loading lists for @"+username+ "…");
		Spaz.UI.statusBar("Loading lists for @"+username+ "…");
		Spaz.UI.showLoading();
		
		
		
		thisULT.twit.getLists(username, function(data) {
			/*
				build a new menu
			*/
			var i, iMax,
				root_container_selector = '#container',
				menu_id = 'lists-menu',
				menu_class = 'popup-menu',
				menu_items = [],
				menu_item_class = 'userlists-menu-item',
				menu_trigger_selector = '#view-userlists';
			
			// if it exists, remove
			$('#'+menu_id).remove();
			
			for (i = 0, iMax = data.lists.length; i < iMax; i++){
				var thislist = data.lists[i];
				menu_items[i] = {
					'label':thislist.full_name,
					'id':'userlist-'+thislist.user.screen_name+'-'+thislist.slug, // this should be unique!
					'attributes':{
						'data-list-id':thislist.id,
						'data-list-name':thislist.name,
						'data-list-slug':thislist.slug,
						'data-user-screen_name':thislist.user.screen_name,
						'title':thislist.description
					},
					'onclick':function(e) {
						var $this = $(this),
							slug  = $this.attr('data-list-slug'),
							user  = $this.attr('data-user-screen_name');
						thisULT.setlist(slug, user);
					}
				};
			}
		
			
			/*
				create container for menu
			*/
			$(root_container_selector).append('<ul id="'+menu_id+'" class="'+menu_class+'"></ul>');
			var $menu = $('#' + menu_id);
			
			/*
				add <li> items to menu
			*/
			for (i = 0, iMax = menu_items.length; i < iMax; i++){

				var menuItem = menu_items[i],
					menuItemAttributes = menuItem.attributes,
					jqitem = $('<li id="'+menuItem.id+'" class="menuitem '+menu_item_class+'">'+menuItem.label+'</li>');

				for (var key in menuItemAttributes) {
					if(menuItemAttributes.hasOwnProperty(key)){
						jqitem.attr(key, menuItemAttributes[key]);
					}
				}

				$menu.append(jqitem);
				
				/*
					if onclick is defined for this item, bind it to the ID of this element
				*/
				if (menuItem.onclick) {
					sch.debug(menuItem.id);
					sch.debug(menuItem.onclick);
					
					$('#'+menuItem.id).bind('click', {'onClick':menuItem.onclick}, function(e) {
						e.data.onClick.call(this, e); // 'this' refers to the clicked element
					});
				}
			}
			
			sch.debug($menu.get(0).innerHTML);
			
			/*
				show menu on event
			*/
			$(menu_trigger_selector).live('click', function(e) {
				/*
					thank you http://stackoverflow.com/questions/158070/jquery-how-to-position-one-element-relative-to-another
				*/
				var $this	= $(this),
					pos		= $this.offset(),
					height	= $this.height(),
					width	= $this.width();
				$menu.css({
					position: 'absolute',
					left:	  pos.left + 'px',
					top:	  (pos.top + height) + 'px'
				}).show();
				
				$(document).one('click', function() {
					$menu.hide();
				});
			});
			
			Spaz.UI.statusBar("Lists loaded for @"+username+ "…");
			Spaz.UI.hideLoading();
			
		}, function(msg) {
			Spaz.UI.statusBar("Loading lists for @"+username+ " failed!");
			Spaz.UI.hideLoading();
			
		});
		
		
	};

	/*
		build the lists menu
	*/
	thisULT.buildListsMenu();
};

UserlistsTimeline.prototype = new AppTimeline();




/**
 * Search timeline def 
 */
var SearchTimeline = function(args) {

	var thisST			 = this,
		$timeline		 = $('#timeline-search'),
		$timelineWrapper = $timeline.parent();
	
	this.query = null;
	this.lastquery = null;
	
	this.twit = new SpazTwit();
	
	var maxST = Spaz.Prefs.get('timeline-search-pager-count-max');
	/*
		set up the public timeline
	*/
	this.timeline  = new SpazTimeline({
		'timeline_container_selector' : $timeline.selector,
		'entry_relative_time_selector':'.status-created-at',
		
		'success_event':'new_search_timeline_data',
		'failure_event':'error_search_timeline_data',
		
		'event_target' :document,
		
		
		'refresh_time':1000*60*15, // 15 minutes
		'max_items': maxST,

		'request_data': function() {
			var $searchInput = jQuery('#search-for');
			var count = Spaz.Prefs.get('timeline-search-pager-count');
			count = (count > maxST ? maxST : count);

			if ($searchInput.val().length > 0) {
				thisST.query = $searchInput.val();

				// Give UI feedback immediately
				Spaz.UI.statusBar("Searching for '" + thisST.query + "'…");
				Spaz.UI.showLoading();
				if($timeline.is(':empty')){
					$timelineWrapper.children('.loading').show();
				}
				$timelineWrapper.children('.intro, .empty').hide();

				if (!thisST.lastquery) {
					thisST.lastquery = thisST.query;
				} else if (thisST.lastquery != thisST.query) {
					$timeline.find('.timeline-entry').remove();
				}
				
				// alert(thisST.lastquery+"\n"+thisST.query);
				
				// clear the existing results if this is a new query
				thisST.markAsRead($timeline.selector + ' div.timeline-entry');
				
				thisST.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
        		var auth = Spaz.Prefs.getAuthObject();
        		var username = Spaz.Prefs.getUsername();
        		thisST.twit.setCredentials(auth);
				thisST.twit.search(thisST.query, null, count);
				thisST.lastquery = thisST.query;
			}
		},
		'data_success': function(e, data) {
			sch.dump(e);
			var query_info = data[1];
			data = data[0] || [];
			
			data = data.reverse();
			var i, iMax,
				no_dupes = [],
				md = new Showdown.converter(),
				sui = new SpazImageURL(),
				dataItem;
			
			for (i = 0, iMax = data.length; i < iMax; i++){
				dataItem = data[i];
				
				/*
					only add if it doesn't already exist
				*/
				if ($timeline.find('div.timeline-entry[data-status-id='+dataItem.id+']').length<1) {
					
					// nl2br
					dataItem.text = sch.nl2br(dataItem.text);
					
					dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.text);
					
					dataItem.text = sch.makeClickable(dataItem.text, SPAZ_MAKECLICKABLE_OPTS);

					// convert emoticons
					dataItem.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.text);
					
					if (dataItem.SC_is_retweet) {
						// nl2br
						dataItem.retweeted_status.text = sch.nl2br(dataItem.retweeted_status.text);

						// add thumbnails
						dataItem.SC_thumbnail_urls = sui.getThumbsForUrls(dataItem.retweeted_status.text);

						// make clickable
						dataItem.retweeted_status.text = sch.makeClickable(dataItem.retweeted_status.text, SPAZ_MAKECLICKABLE_OPTS);

						// convert emoticons
						dataItem.retweeted_status.text = Emoticons.SimpleSmileys.convertEmoticons(dataItem.retweeted_status.text);
					}
					
					// if (Spaz.Prefs.get('usemarkdown')) {
					//	dataItem.text = md.makeHtml(dataItem.text);
					//	dataItem.text = dataItem.text.replace(/href="([^"]+)"/gi, 'href="$1" title="Open link in a browser window" class="inline-link"');
					// }
					
					no_dupes.push(dataItem);
					
					/*
						Save to DB via JazzRecord
					*/
					TweetModel.saveTweet(dataItem);
				}
				
			}
			
			$timelineWrapper.children('.loading, .intro').hide();
			if (no_dupes.length > 0) {
				thisST.timeline.addItems(no_dupes);
			}
			$timelineWrapper.children('.empty').toggle($timeline.is(':empty'));

			sch.markAllAsRead($timeline.selector + ' div.timeline-entry'); // search are never "new"
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');

			Spaz.UI.hideLoading();
			Spaz.UI.statusBar("Ready");
		},
		'data_failure': function(e, error_obj) {
			var err_msg = "There was an error retrieving your favorites";
			Spaz.UI.statusBar(err_msg);

			/*
				Update relative dates
			*/
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			Spaz.UI.hideLoading();
		},
		'renderer': function(obj) {
			
			var html = Spaz.Tpl.parse('timeline_entry', obj);
			return html;
			
		}
	});

	this.buildSavedSearchesMenu = function(){
		// TODO: Fix all the duplication with `this.buildListsMenu`

		var auth     = Spaz.Prefs.getAuthObject(),
		    username = Spaz.Prefs.getUsername();
		thisST.twit.setCredentials(auth);
		thisST.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
		sch.debug('Loading saved searches for @'+username+'…');
		Spaz.UI.statusBar('Loading saved searches for @'+username+'…');
		Spaz.UI.showLoading();

		function onGetSavedSearchesSuccess(data){
			var i, iMax, key,
			    rootContainerSelector = '#container',
			    $menu,
			    menuId = 'saved-searches-menu',
			    menuClass = 'popup-menu',
			    menuItem, menuItems = [], $menuItem,
			    menuItemClass = 'saved-searches-menu-item',
			    menuItemAttributes,
			    menuTriggerSelector = '#search-saved',
			    search;

			// If the menu exists, remove it
			$('#' + menuId).remove();

			// Collect menu data
			for(i = 0, iMax = data.length; i < iMax; i++){
				search = data[i];
				menuItems[i] = {
					label: search.name,
					id:    'saved-search-' + search.id,
					attributes: {
						'data-saved-search-id':       search.id,
						'data-saved-search-name':     search.name,
						'data-saved-search-query':    search.query,
						'data-saved-search-position': search.position
					},
					onclick: function(e){
						var query = $(this).attr('data-saved-search-query');
						$('#search-for').val(query);
						thisST.timeline.refresh();
					}
				};
			}

			// Create menu
			$menu = $('<ul id="' + menuId + '" class="' + menuClass + '"></ul>');
			for(i = 0, iMax = menuItems.length; i < iMax; i++){
				menuItem = menuItems[i];
				menuItemAttributes = menuItem.attributes;
				$menuItem = $(
					'<li id="' + menuItem.id +
						'" class="menuitem ' + menuItemClass + '">' +
						menuItem.label +
					'</li>');
				for(key in menuItemAttributes){
					if(menuItemAttributes.hasOwnProperty(key)){
						$menuItem.attr(key, menuItemAttributes[key]);
					}
				}
				$menu.append($menuItem);

				// Attach menu item click handler, if any
				if(menuItem.onclick){
					$menuItem.bind('click', {onClick: menuItem.onclick}, function(e){
						e.data.onClick.call(this, e); // `this`: The clicked item
					});
				}
			}

			// Add menu to DOM
			$menu.appendTo(rootContainerSelector);

			// Bind menu toggling handlers
			(function(){
				var $document = $(document);

				function showMenu(e){
					var $this = $(e.target),
					    pos   = $this.offset();
					$menu.css({
						position: 'absolute',
						left:     pos.left + 'px',
						top:      (pos.top + $this.height()) + 'px'
					}).show();
				}
				function hideMenu(e){ $menu.hide(); }
				function toggleMenu(e){
					if($menu.is(':visible')){
						hideMenu(e);
					}else{
						showMenu(e);
					}
				}

				$(menuTriggerSelector).live('click', function(e){
					toggleMenu(e);
					$document.one('click', function(e){
						if(!$(e.target).is(menuTriggerSelector)){
							hideMenu(e);
						}
					});
				});
			})();

			Spaz.UI.statusBar('Saved searches loaded for @' + username);
			Spaz.UI.hideLoading();
		}

		function onGetSavedSearchesFailure(msg){
			Spaz.UI.statusBar(
				'Loading saved searches for @' + username + ' failed!');
			Spaz.UI.hideLoading();
		}

		thisST.twit.getSavedSearches(
			onGetSavedSearchesSuccess, onGetSavedSearchesFailure);
	};

	thisST.buildSavedSearchesMenu();

};

SearchTimeline.prototype = new AppTimeline();




/**
 * Followers/following timeline def 
 */
var FollowersTimeline = function(args) {

	var thisFLT			 = this,
		$timeline		 = $('#timeline-followerslist'),
		$timelineWrapper = $timeline.parent();
	this.twit = new SpazTwit();
	
	/*
		set up the user timeline
	*/
	this.timeline  = new SpazTimeline({
		'timeline_container_selector' : $timeline.selector,
		'entry_relative_time_selector':'.status-created-at',
		
		'success_event':'get_followerslist_succeeded',
		'failure_event':'get_followerslist_failed',
		'event_target' :document,
		
		'refresh_time':-1, // never automatically
		'max_items':200,

		'request_data': function() {
			sch.markAsRead($timeline.selector + ' div.timeline-entry');
			thisFLT.twit.setCredentials(Spaz.Prefs.getAuthObject());
			thisFLT.twit.setBaseURLByService(Spaz.Prefs.getAccountType());
			thisFLT.twit.getFollowersList();
			Spaz.UI.statusBar("Loading followerslist");
			Spaz.UI.showLoading();
		},
		'data_success': function(e, data) {
			// alert('got follower data');
			data = data.reverse();
			
			var i, iMax,
				no_dupes = [],
				dataItem;
			
			for (i = 0, iMax = data.length; i < iMax; i++){
				dataItem = data[i];
				
				/*
					only add if it doesn't already exist
				*/
				if ($timeline.find('div.timeline-entry[data-status-id='+dataItem.id+']').length<1) {
					
					no_dupes.push(dataItem);
					/*
						Save to DB via JazzRecord
					*/
					TwUserModel.findOrCreate(dataItem);
				}
				
			}

			$timelineWrapper.children('.loading, .new-user').hide();
			thisFLT.timeline.addItems(no_dupes);

			Spaz.UI.hideLoading();
			Spaz.UI.statusBar("Ready");
			
		},
		'data_failure': function(e, error_obj) {
			var err_msg = "There was an error retrieving the user timeline";
			Spaz.UI.statusBar(err_msg);

			/*
				Update relative dates
			*/
			sch.updateRelativeTimes($timeline.selector + ' a.status-created-at', 'data-created-at');
			Spaz.UI.hideLoading();
		},
		'renderer': function(obj) {
			return Spaz.Tpl.parse('followerslist_row', obj);
			
		}
	});
	
};

FollowersTimeline.prototype = new AppTimeline();


/**
 * Initialize the timelines 
 */
Spaz.Timelines.init = function() {
	Spaz.Timelines.friends	 = new FriendsTimeline();
	Spaz.Timelines.user		 = new UserTimeline();
	Spaz.Timelines['public'] = new PublicTimeline();
		// `public` is a reserved keyword
	Spaz.Timelines.favorites = new FavoritesTimeline();
	Spaz.Timelines.userlists = new UserlistsTimeline();
	Spaz.Timelines.search	 = new SearchTimeline();
	Spaz.Timelines.followers = new FollowersTimeline();
	
	Spaz.Timelines.map = {
		friends:	Spaz.Timelines.friends,
		user:		Spaz.Timelines.user,
		'public':	Spaz.Timelines['public'],
		userlists:	Spaz.Timelines.userlists,
		favorites:	Spaz.Timelines.favorites,
		search:		Spaz.Timelines.search//,
		// followerslist: Spaz.Timelines.followerslist
	};


};

Spaz.Timelines.getTimelineFromTab = function(tab) {
	var timeline = tab.id.replace(/tab-/, '');
	sch.debug('timeline for tab:' + timeline);
	return Spaz.Timelines.map[timeline];
};

Spaz.Timelines.getTabFromTimeline = function(tab) {
	var timeline = tab.id.replace(/tab-/, '');
	sch.debug('timeline for tab:' + timeline);
	return Spaz.Timelines.map[timeline];
};

Spaz.Timelines.toggleNewUserCTAs = function(){
	var anyAccts = Spaz.AccountPrefs.spaz_acc.getAll().length > 0,
	    $timelines = $(
	    	'#timelinewrapper-friends, ' +
	    	'#timelinewrapper-user, ' +
	    	'#timelinewrapper-favorites, ' +
	    	'#timelinewrapper-userlists, ' +
	    	'#timelinewrapper-public, ' +
	    	'#timelinewrapper-followerslist');
	$timelines.each(function(){
		// Timelines that require user interaction first (e.g., choose a
		// list, enter a search query) should show the intro by default.
		// Otherwise, show the loading indicator by default.

		var $timeline = $(this),
		    $intro = $timeline.children('.intro');
		if(!!$intro[0]){
			$intro.toggle(anyAccts);
		}else{
			$timeline.children('.loading').toggle(anyAccts);
		}
		$timeline.children('.new-user').toggle(!anyAccts);
	});
};

Spaz.Timelines.resetTimelines = function() {
	/*
		remove all timeline event listeners
	*/
	var timelinesMap = Spaz.Timelines.map;

	if (typeof timelinesMap !== 'undefined') {
		for (var key in timelinesMap) {
			if(timelinesMap.hasOwnProperty(key)){
				sch.error(key);
				timelinesMap[key].timeline.stopListening();
			}
		}
	}

	Spaz.Timelines.init();


	/*
		clear timeline entries inside the timelines
	*/
	$('div.timeline-entry').remove();

};

