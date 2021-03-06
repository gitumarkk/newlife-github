var App = {};

App.urls = {
    issues_root: function(state) {
        return "https://api.github.com/repos/newlif/teams/issues?state=" + state;
    },
    issue_comments: function(number_id) {
        return "https://api.github.com/repos/newlif/teams/issues/" + number_id + "/comments";
    }
};

App.GithubIssuesModel = Backbone.Model.extend({
    urlRoot: "https://api.github.com/repos/newlif/teams/issues",
});

App.GithubIssuesCollection = Backbone.Collection.extend({
    model: App.GithubIssuesModel,
    // url: App.urls.issues_root("open"),

    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        self.view = options.view;
        return self;
    },

    url: function() {
        var self = this;
        return self.instanceUrl;
    },

    comparator: function(m) {
        var self = this;
        // For some reason it parses the options passed in
        if (m.get("milestone")) {
            return Date.parse(m.get("milestone").due_on);
        }
    },

    // Parse the data to filter out issues with closed milestones, seems api
    // doesn't support issues filtering on open milestones. Not ideal as gets
    // all data but should work for now.
    parse: function(data) {
        var self = this;

        if (self.view === "calendar") return data;

        return _.filter(data, function(issue) {
            return issue.milestone.state === "open";
        });
    },

    helper_labels: function(model_items) {
        var self = this;
        // flatten transforms  [[1], [2]] to [1, 2]
        var labels = _.flatten(_.map(model_items, function (item) {
            return item.attributes.labels;
        }));
        return _.sortBy(_.uniq(labels, function(item) { return item.name; }), "name");
    },

    /**
    * Abstracts filtering model by label
    * @params {object} model -  the model instanc the collection
    * @params {string} label - the label to be compared
    * @returns {boolean} - Does model have the labels
    */
    helper_filter_label: function(model, label) {
        var self = this;
        var labels = _.map(_.flatten(model.get("labels")), function(item) {
            return item.name;
        });
        return labels.indexOf(label) !== -1;
    },

    git_labels: function() {
        var self = this;
        return self.helper_labels(self.models);
    },

    getCollectionLabel: function(label) {
        var self = this;
        var filteredCollection = this.filter(function(model) {
            return self.helper_filter_label(model, label);
        });
        return _.map(filteredCollection, function(model) {
            return model.attributes;
        });
    },

    groupByMilestones: function() {
        var self = this,

            // FIltering out the options url
            models = _.filter(self.models, function(model) {return model.attributes.milestone !== undefined; });

            // Grouping the models by the milestone title
            grouped =  _.groupBy(models, function(model) {
                return model.attributes.milestone.title;
            });

            // Grouping the labels in each milestone by the label title
            new_group = _.map(grouped, function(grouped_models, key) {
                var temp_value,
                    output_dict = {},
                    grouped_label_dict = {},
                    labels = self.git_labels(),
                    rank = {};

                if (self.view === "calendar") {
                    rank = {
                        "Overview": 1,
                        "Setup": 2,
                        "Sound": 3,
                        "Welcome": 4,
                        "Anchor": 5,
                        "Worship": 6,
                        "Announce": 7,
                        "Kids": 8,
                        "Preach": 9
                    };

                } else {
                    rank = {
                        "Overview": 1,
                        "Setup": 2,
                        "Welcome": 3
                    };

                }

                labels = _.sortBy(labels, function(element) {
                    return rank[element.name];
                });

                // For each label filter the models according to the label and add the label as a key
                // to the output dictionary
                _.each(labels, function(label) {
                    var filtered_labels = _.filter(grouped_models, function(model) {
                        return self.helper_filter_label(model, label.name);
                    });

                    if (filtered_labels.length !== 0) {
                        grouped_label_dict[label.name] = filtered_labels;
                    }
                });
                output_dict["milestone"] = key;
                output_dict["data"] = grouped_label_dict;
                return output_dict;
            });
            return new_group;
    }
});

App.GithubCommentsModel = Backbone.Model.extend({
    idAttribute: "id",
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
});

App.GithubCommentsCollection = Backbone.Collection.extend({
    model: App.GithubCommentsModel,
    initialize: function(options) {
        var self = this;
        self.instanceUrl = options.url;
        return self;
    },
    url: function() {
        var self = this;
        return self.instanceUrl;
    }
});


App.AppView = Backbone.View.extend({
    el: "#workspace",
    git_comment_collection: undefined,
    events: {
        "click .issues-nav a": "navigateLabelDetail",
        "click .view-issue": "viewIssueComment",
        "click #week-view": "navigateList",
        "click #label-view": "navigateLabel",
        "click #calendar-view": "navigateCalendar"
    },
    initialize: function(options) {
        var self = this;
        _.bindAll(
            self,
            "renderLabels",
            "renderLabelDetail",
            "viewIssueComment",
            "renderComments",
            "gitFetchError");
        self.git_collection = options.git_collection;
        self.issues_template = _.template($("#github-issues-template").html());
        self.comments_template = _.template($("#github-issue-comments-template").html());
        self.milestones_template = _.template($("#github-milestones-template").html());
        self.calendar_template = _.template($("#github-calendar-template").html());
        return this;
    },

    navigateCalendar: function(ev) {
        ev.preventDefault();

        var self = this;
        Backbone.history.navigate("", {trigger: true});
    },

    navigateList: function(ev) {
        ev.preventDefault();

        var self = this;
        Backbone.history.navigate("list/", {trigger: true});
    },

    navigateLabel: function(ev) {
        ev.preventDefault();

        var self = this;
        Backbone.history.navigate("labels/", {trigger: true});
    },

    navigateLabelDetail: function(ev) {
        ev.preventDefault();

        var self = this,
            $element = $(ev.currentTarget),
            label = $element.data("label");

        if (label === "default") {
            Backbone.history.navigate("labels/", {trigger: true});
        } else {
            Backbone.history.navigate("labels/" + label + "/", {trigger: true});
        }

    },

    /** Render calendar after fetching github data */
    renderCalendarView: function() {
        var self = this,
            titles = [],
            processedEntries = [],
            entries = self.git_collection.groupByMilestones();

        self.$("#nav-menu").hide();

        if (entries.length !== 0) {
            titles = _.chain(entries).map(function(entry) {
                return _.map(entry.data, function(v, k) {
                    return k;
                });
            }).flatten().uniq().value();
        }

        var sortBy = {
            "Overview": 1,
            "Setup": 2,
            "Sound": 3,
            "Welcome": 4,
            "Anchor": 5,
            "Worship": 6,
            "Announce": 7,
            "Kids": 8,
            "Preach": 9,
            "Ministry": 10,
            "Food": 11
        };

        titles = _.sortBy(titles, function(title) {
            return sortBy[title];
        });

        // Converting data structure for the data entries to have the same length
        processedEntries = _.map(entries, function(entry) {
            var output = [];
            var date_now = moment().toDate();
            var milestoneUrl = "";

            _.each(titles, function(title) {
                var temp = {};
                var attr = _.find(entry.data, function(v, k) {
                    return k === title;
                });

                if (attr) {
                    // Splitting the title and getting the person's name
                    var nameTitle = attr[0].attributes.title;
                    var split_name_array = nameTitle.split("-");

                    if (split_name_array.length === 1) {
                        name_title = _.last(split_name_array);

                    } else {  // Assumes there are extra dashes in the name
                        split_name_array.shift();  // remove first element
                        name_title = split_name_array.join(" - ");
                    }

                    if (nameTitle.toLowerCase().indexOf("overview") !== -1) {
                        name_title = attr[0].attributes.body;
                    }

                    var milestone = attr[0].attributes.milestone;

                    if (milestone) {
                        milestoneUrl = milestone.html_url;
                    }

                } else {
                    name_title = "-";
                }

                output.push({
                    key: title,
                    value: name_title.trim()
                });
            });

            var past = date_now > moment(entry.milestone).toDate();

            return {
                date: {date: moment(entry.milestone).format("MMM-DD"), milestoneUrl: milestoneUrl},
                data: output,
                style: past === true ? "background:#C0C0C0;" : ""
            };
        });

        self.$("#workspace-items").html(self.calendar_template({
            entries: processedEntries,
            titles: titles
        }));
    },

    renderListView: function() {
        var self = this,
            milestones = self.git_collection.groupByMilestones();

        self.$("#nav-menu").show();

        self.$("#workspace-items").html("");
        _.each(milestones, function(data, index) {
            var overview_data, $tmpl;

            if (_.has(data.data, "Overview")) {
                overview_data = data.data["Overview"][0].attributes;
                delete data.data["Overview"];
            }
            _.extend(data, {"overview": overview_data});

            $tmpl = $(self.milestones_template(data));

            self.$("#workspace-items").append($tmpl);

        });
    },

    /**
    * Rendering the main workspace view and populating labels. Also renders
    * overall issues
    */
    renderLabels: function() {
        var self = this,
            labels = self.git_collection.git_labels();

        self.$("#nav-menu").show();

        self.$("#workspace-items").html(self.issues_template({
            issues: self.git_collection.toJSON(),
            labels: labels
        }));
    },

    renderLabelDetail: function(label) {
        var self = this,
            labels = self.git_collection.git_labels();

        self.$("#nav-menu").show();

        self.$("#issue-nav li").removeClass("active");

        if (label === "default") {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.toJSON(),
                labels: labels
            }));
        } else {
            self.$("#workspace-items").html(self.issues_template({
                issues: self.git_collection.getCollectionLabel(label),
                labels: labels
            }));
        }
        // $element.addClass("active");
    },

    viewIssueComment: function(ev) {
        var self = this, $element;
        ev.preventDefault();
        $element = $(ev.currentTarget);

        self.$("#nav-menu").show();

        self.git_comment_collection = new App.GithubCommentsCollection({
            url: $element.data("comments-url")
        });
        self.git_comment_collection.fetch({
            success: self.renderComments,
            error: self.gitFetchError
        });
    },

    renderComments: function() {
        var self = this, comments;
        comments = self.git_comment_collection.toJSON();

        self.$("#nav-menu").show();

        _.each(comments, function(comment) {
            var issue = self.git_collection.findWhere({
                url: comment.issue_url
            });

            if (issue) {
                comment.issue_title = issue.attributes.title;
            }
        });

        self.$("#workspace-items").html(self.comments_template({comments: comments}));
    },

    gitFetchError: function(response, options, status) {
        var self = this;
        console.error(response, options);
    },
    getIssueTitleForComments: function(comments_url) {
        var self = this;
    },
});

App.AppRouter = Backbone.Router.extend({
    routes: {
        "": "renderCalendarView",
        "list/": "renderListView",
        "labels/": "renderLabels",
        "labels/:label/": "renderLabelDetail"
    },

    initialize: function(options) {
        var self = this;
        self.collection_fetched = undefined;
    },

    renderCalendarView: function() {
        var self = this,
            app_options = {};

        app_options.url = App.urls.issues_root("all");
        app_options.view = "calendar";

        self.git_collection = new App.GithubIssuesCollection(app_options);

        self.fetch_collection = self.git_collection.fetch();

        self.app = new App.AppView({
            git_collection: self.git_collection,
        });

        self.fetch_collection.done(function() {
            self.app.renderCalendarView();
            self.collection_fetched = true;
        });
    },

    renderListView: function() {
        var self = this,
            app_options = {};

        app_options.url = App.urls.issues_root("open");

        self.git_collection = new App.GithubIssuesCollection(app_options);

        self.fetch_collection = self.git_collection.fetch();

        self.app = new App.AppView({
            git_collection: self.git_collection
        });

        self.fetch_collection.done(function() {
            self.app.renderListView();
            self.collection_fetched = true;
        });
    },

    renderLabels: function() {
        var self = this;

        if (self.collection_fetched) {
            self.app.renderLabels();

        } else {
            var app_options = {};

            app_options.url = App.urls.issues_root("open");

            self.git_collection = new App.GithubIssuesCollection(app_options);

            self.fetch_collection = self.git_collection.fetch();

            self.app = new App.AppView({
                git_collection: self.git_collection
            });

            self.fetch_collection.done(function() {
                self.app.renderLabels();
                self.collection_fetched = true;
            });
        }
    },

    renderLabelDetail: function(label) {
        var self = this;

        if (self.collection_fetched) {
            self.app.renderLabelDetail(label);

        } else {
            var app_options = {};

            app_options.url = App.urls.issues_root("open");

            self.git_collection = new App.GithubIssuesCollection(app_options);

            self.fetch_collection = self.git_collection.fetch();

            self.app = new App.AppView({
                git_collection: self.git_collection
            });

            self.fetch_collection.done(function() {
                self.app.renderLabelDetail(label),
                self.collection_fetched = true;
            });
        }
    }
});


$(document).ready(function() {
    new App.AppRouter({});
    Backbone.history.start({pushstate: true});
});
